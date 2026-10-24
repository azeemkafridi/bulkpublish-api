/**
 * MCP Tasks extension (io.modelcontextprotocol/tasks, protocol 2026-07-28).
 *
 * A tools/call for a slow tool can be answered with a task handle instead of
 * the result; the client then polls tasks/get until the task finishes. Spec:
 * https://modelcontextprotocol.io/seps/2663-tasks-extension
 *
 * Three gates, all required before a call becomes a task:
 *   1. the server instance serves 2026-07-28 (installTasks is only called on
 *      those; a 2025-era client never reaches this file),
 *   2. that request declares the extension in its per-request capabilities,
 *   3. the tool is listed in TASK_TOOLS.
 * Anything else is passed straight to the SDK's own tools/call handler.
 *
 * Task state lives in a TaskStore: Redis on the hosted server, so any request
 * can answer tasks/get and a task outlives the request that started it; memory
 * for stdio, where one process serves one user. The work itself runs in the
 * process that accepted the call.
 *
 * Concurrency: the record is written by the worker (progress, heartbeat, the
 * final result) and by tasks/get (marking a task whose worker died). Every
 * write is a compare-and-set on `version`, so neither can overwrite a write it
 * did not see. tasks/cancel never touches the record: it sets a separate flag
 * the worker reads, so a cancel racing the final result cannot erase it.
 * tasks/update does the same with answers: each goes to its own key (first
 * answer wins) and the worker picks it up.
 *
 * Input (elicitation): a task may pause as `input_required` with
 * `inputRequests` — publish_post asks "publish this now?" — only when the
 * request also declared it can show forms. Only an explicit yes goes ahead.
 */
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { Redis } from "ioredis";
import type { McpServer } from "@modelcontextprotocol/server";

export const TASKS_EXTENSION = "io.modelcontextprotocol/tasks";
const CLIENT_CAPABILITIES_KEY = "io.modelcontextprotocol/clientCapabilities";

// JSON-RPC codes the spec names.
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const MISSING_CLIENT_CAPABILITY = -32021;

const TASK_TTL_MS = 60 * 60 * 1000;
// A running task refreshes lastUpdatedAt this often. A working task whose
// timestamp is older than STALE_AFTER_MS was being run by a process that has
// since stopped (a deploy or a crash), so tasks/get reports it failed instead
// of leaving the client polling a task that will never finish.
const HEARTBEAT_MS = 30_000;
const STALE_AFTER_MS = 3 * 60_000;
const STALE_MESSAGE = "The server restarted while this was running. Check the result before trying again.";

type TaskStatus = "working" | "input_required" | "completed" | "failed" | "cancelled";
const ACTIVE: ReadonlySet<TaskStatus> = new Set(["working", "input_required"]);

/** One server-to-client request carried in inputRequests (MRTR shape). */
export interface InputRequest {
  method: "elicitation/create";
  params: { mode: "form"; message: string; requestedSchema: Record<string, unknown> };
}
/** The client's answer to an elicitation: accept (with content), decline or cancel. */
export interface ElicitAnswer {
  action: "accept" | "decline" | "cancel";
  content?: Record<string, unknown>;
}

export interface TaskRecord {
  taskId: string;
  /** sha256 of the caller's API key; every tasks/* call must present the same key. */
  owner: string;
  tool: string;
  status: TaskStatus;
  statusMessage?: string;
  createdAt: string;
  lastUpdatedAt: string;
  ttlMs: number;
  pollIntervalMs: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  /** Outstanding questions while status is input_required (keys never reused). */
  inputRequests?: Record<string, InputRequest>;
  /** Bumped on every write; the compare-and-set token. */
  version: number;
  /**
   * Set when tasks/get gave the worker up for dead. If the worker was only
   * delayed and does finish, its real result replaces this verdict.
   */
  presumedDead?: boolean;
}

export interface TaskStore {
  /** Must not resolve until a get() for the same id would find it (spec: durable creation). */
  create(task: TaskRecord): Promise<void>;
  get(taskId: string): Promise<TaskRecord | undefined>;
  /**
   * Writes `next` only if the stored record is still at `next.version - 1`.
   * Returns false when someone else wrote first (or the task expired).
   */
  replace(next: TaskRecord): Promise<boolean>;
  requestCancel(task: TaskRecord): Promise<void>;
  cancelRequested(taskId: string): Promise<boolean>;
  /** Records an answer unless one is already recorded for that key (first wins). */
  putAnswer(task: TaskRecord, key: string, answer: unknown): Promise<void>;
  getAnswer(taskId: string, key: string): Promise<unknown | undefined>;
}

const expiresAt = (task: TaskRecord) => Date.parse(task.createdAt) + task.ttlMs;

export class MemoryTaskStore implements TaskStore {
  private tasks = new Map<string, TaskRecord>();
  private cancels = new Set<string>();
  private answers = new Map<string, unknown>();
  async create(task: TaskRecord): Promise<void> {
    this.sweep();
    this.tasks.set(task.taskId, structuredClone(task));
  }
  async get(taskId: string): Promise<TaskRecord | undefined> {
    this.sweep();
    const hit = this.tasks.get(taskId);
    return hit ? structuredClone(hit) : undefined;
  }
  async replace(next: TaskRecord): Promise<boolean> {
    this.sweep();
    const cur = this.tasks.get(next.taskId);
    if (!cur || cur.version !== next.version - 1) return false;
    this.tasks.set(next.taskId, structuredClone(next));
    return true;
  }
  async requestCancel(task: TaskRecord): Promise<void> {
    this.cancels.add(task.taskId);
  }
  async cancelRequested(taskId: string): Promise<boolean> {
    return this.cancels.has(taskId);
  }
  async putAnswer(task: TaskRecord, key: string, answer: unknown): Promise<void> {
    const k = `${task.taskId}\u0000${key}`;
    if (!this.answers.has(k)) this.answers.set(k, structuredClone(answer));
  }
  async getAnswer(taskId: string, key: string): Promise<unknown | undefined> {
    return structuredClone(this.answers.get(`${taskId}\u0000${key}`));
  }
  private sweep(): void {
    const now = Date.now();
    for (const [id, t] of this.tasks) {
      if (expiresAt(t) <= now) {
        this.tasks.delete(id);
        this.cancels.delete(id);
        for (const k of this.answers.keys()) if (k.startsWith(`${id}\u0000`)) this.answers.delete(k);
      }
    }
  }
}

// Compare-and-set in one round trip. A Lua script rather than WATCH/MULTI:
// one ioredis connection is shared by every task in the process, and WATCH is
// per connection, so another task's commands could land inside the window.
const REPLACE_LUA = `
local cur = redis.call('GET', KEYS[1])
if not cur then return 0 end
if cjson.decode(cur).version ~= tonumber(ARGV[2]) then return 0 end
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[3])
return 1`;

export class RedisTaskStore implements TaskStore {
  private redis: Redis;
  constructor(url: string) {
    // Fail fast rather than queue: a call that cannot store its task must fall
    // back to answering synchronously, not hang waiting for a reconnect.
    this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 1, enableOfflineQueue: false });
    // ioredis keeps reconnecting and emits on every attempt; say it once per
    // change rather than flooding the log while Redis is down.
    let last = "";
    this.redis.on("error", (err: Error & { code?: string }) => {
      const what = err.code || err.message || err.name;
      if (what !== last) console.error("Task store (Redis) unavailable:", (last = what));
    });
    this.redis.on("ready", () => {
      if (last) console.error("Task store (Redis) reconnected.");
      last = "";
    });
  }
  private key(taskId: string): string {
    return `mcp:task:${taskId}`;
  }
  // The Redis this runs against evicts nothing (noeviction), so every key MUST
  // expire on its own. TTL runs from creation, as the spec defines it.
  private remaining(task: TaskRecord): number {
    return Math.max(1, expiresAt(task) - Date.now());
  }
  async create(task: TaskRecord): Promise<void> {
    await this.redis.set(this.key(task.taskId), JSON.stringify(task), "PX", this.remaining(task));
  }
  async get(taskId: string): Promise<TaskRecord | undefined> {
    const raw = await this.redis.get(this.key(taskId));
    return raw ? (JSON.parse(raw) as TaskRecord) : undefined;
  }
  async replace(next: TaskRecord): Promise<boolean> {
    const ok = await this.redis.eval(
      REPLACE_LUA, 1, this.key(next.taskId),
      JSON.stringify(next), String(next.version - 1), String(this.remaining(next))
    );
    return ok === 1;
  }
  async requestCancel(task: TaskRecord): Promise<void> {
    await this.redis.set(`${this.key(task.taskId)}:cancel`, "1", "PX", this.remaining(task));
  }
  async cancelRequested(taskId: string): Promise<boolean> {
    return (await this.redis.exists(`${this.key(taskId)}:cancel`)) === 1;
  }
  private answerKey(taskId: string, key: string): string {
    // The key is client-supplied text; hash it so it cannot shape our keyspace.
    return `${this.key(taskId)}:answer:${createHash("sha256").update(key).digest("hex")}`;
  }
  async putAnswer(task: TaskRecord, key: string, answer: unknown): Promise<void> {
    await this.redis.set(this.answerKey(task.taskId, key), JSON.stringify(answer), "PX", this.remaining(task), "NX");
  }
  async getAnswer(taskId: string, key: string): Promise<unknown | undefined> {
    const raw = await this.redis.get(this.answerKey(taskId, key));
    return raw ? JSON.parse(raw) : undefined;
  }
}

/** The hosted server's store, or none (tasks off) when MCP_TASKS_REDIS_URL is unset. */
let hostedStore: TaskStore | null | undefined;
export function hostedTaskStore(): TaskStore | null {
  if (hostedStore === undefined) {
    const url = process.env.MCP_TASKS_REDIS_URL;
    hostedStore = url ? new RedisTaskStore(url) : null;
  }
  return hostedStore;
}

export function ownerOf(apiKey: string): string {
  return createHash("sha256").update(apiKey).digest("hex");
}

type CallToolResult = Record<string, unknown> & { isError?: boolean; structuredContent?: unknown };
/** Runs a tool through the SDK's normal tools/call path (validation, output schema, projection). */
type CallTool = (name: string, args: Record<string, unknown>) => Promise<CallToolResult>;

/** Asks the client one question and waits: the answer, or "cancelled" / "timeout". */
type Ask = (key: string, params: InputRequest["params"], timeoutMs: number) => Promise<ElicitAnswer | "cancelled" | "timeout">;

/** What a task's run() returns when it honoured a cancel instead of finishing. */
export class TaskCancelled {
  constructor(readonly message: string) {}
}

export interface TaskToolSpec {
  pollIntervalMs: number;
  statusMessage: string;
  /**
   * Optional: decides whether this call needs a task at all. Returns the
   * ordinary result to answer synchronously, or undefined to become a task.
   * Without it, every eligible call becomes a task.
   */
  prepare?(ctx: { args: Record<string, unknown>; call: CallTool; canAsk: boolean }): Promise<CallToolResult | undefined>;
  /**
   * Produces the task's final tool result. `call` runs any tool exactly as a
   * normal tools/call would; `progress` updates the statusMessage; `cancelled`
   * reports whether the client asked to cancel.
   */
  run(ctx: {
    args: Record<string, unknown>;
    call: CallTool;
    progress: (message: string) => Promise<void>;
    cancelled: () => Promise<boolean>;
    /**
     * Pauses the task as input_required with one question and waits for the
     * answer. Undefined when the client did not declare it can show forms.
     * Resolves to the answer, or to "cancelled" / "timeout".
     */
    ask?: Ask;
  }): Promise<CallToolResult | TaskCancelled>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Post statuses that end a publish (webapp post_status). `processing` is not
// terminal: some platforms take minutes to finish a video after accepting it.
const POST_DONE = new Set(["published", "partial", "failed"]);
const PUBLISH_WAIT_MS = 15 * 60_000;
// Reading the post back can fail for reasons that say nothing about the
// publish (a timeout, a rate limit). Only this many failures IN A ROW end the
// wait, and even then the task reports the queued post, never an error: an
// error would read as "the publish failed" and invite a duplicate.
const MAX_READ_FAILURES = 5;

const PLATFORM_NAMES: Record<string, string> = {
  x: "X", instagram: "Instagram", linkedin: "LinkedIn", facebook: "Facebook", tiktok: "TikTok",
  youtube: "YouTube", pinterest: "Pinterest", threads: "Threads", bluesky: "Bluesky", gmb: "Google Business",
  mastodon: "Mastodon", snapchat: "Snapchat", discord: "Discord", telegram: "Telegram", tumblr: "Tumblr",
};
const listNames = (names: string[]) =>
  names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "the platform");

// The one place a question is asked: a retry that could post twice. A
// destination is "unconfirmed" when we sent the post but the platform's reply
// was lost, so it may already be live; the API refuses to retry it unless the
// caller passes republish: true. Only a person looking at the account can
// say, so that is what we ask. Routine publishing never asks: it has to run
// unattended, hundreds at a time.
const UNCONFIRMED_WAIT_MS = 10 * 60_000;

/**
 * The API's own rule for that refusal (webapp posts/[id]/retry.ts): within
 * the requested scope (one postPlatformId, or the whole post) nothing is
 * `failed` and something is `unconfirmed`. Undefined when that is not the
 * situation, or the post cannot be read.
 */
async function unconfirmedScope(call: CallTool, args: Record<string, unknown>) {
  const post = await call("get_post", { postId: args.postId }).catch(() => undefined);
  if (!post || post.isError) return undefined;
  const sc = (post.structuredContent ?? {}) as {
    content?: unknown;
    postPlatforms?: Array<{ id?: unknown; platform?: unknown; status?: unknown }>;
  };
  const rows = (sc.postPlatforms ?? []).filter(
    (r) => args.postPlatformId === undefined || Number(r.id) === Number(args.postPlatformId)
  );
  const unconfirmed = rows.filter((r) => r.status === "unconfirmed");
  if (unconfirmed.length === 0 || rows.some((r) => r.status === "failed")) return undefined;
  return {
    names: [...new Set(unconfirmed.map((r) => String(r.platform ?? "")).filter(Boolean))].map((p) => PLATFORM_NAMES[p] ?? p),
    // Which destinations the question is about; checked again after the answer.
    key: unconfirmed.map((r) => String(r.id)).sort().join(","),
    text: typeof sc.content === "string" ? sc.content : "",
  };
}

function unconfirmedQuestion(scope: { names: string[]; text: string }): InputRequest["params"] {
  // The post's text is not ours and may have been written by an agent from
  // untrusted input: label it as the post's, on its own line, and drop the
  // quote marks and backticks it could use to pose as part of our wording.
  // Hashtags, @handles and underscores stay, so the user can find the post.
  const clean = scope.text.replace(/[`"\u201c\u201d]/g, "").replace(/\s+/g, " ").trim();
  const excerpt = clean ? `\n\nPost text: ${clean.length > 160 ? `${clean.slice(0, 157)}...` : clean}` : "";
  const where = listNames(scope.names);
  return {
    mode: "form",
    message:
      `This post may already be live on ${where}. It was sent, but ${where} never confirmed it, ` +
      `so retrying could post it twice. Check the account, then tell us whether it is there.${excerpt}`,
    requestedSchema: {
      type: "object",
      properties: {
        notLive: {
          type: "boolean",
          title: "It is not live, retry it",
          description: `Tick only after checking ${where} and finding the post missing.`,
        },
      },
      required: ["notLive"],
    },
  };
}

export const TASK_TOOLS: Record<string, TaskToolSpec> = {
  // Downloading and storing a video can take minutes; nothing to add but time.
  // An upload cannot be called back midway, so a cancel is acknowledged and
  // the task still completes (the spec makes cancellation cooperative).
  upload_media: {
    pollIntervalMs: 2000,
    statusMessage: "Uploading the file to your media library.",
    run: ({ args, call }) => call("upload_media", args),
  },
  // publish_post itself returns as soon as the post is queued. As a task it
  // also waits for the platforms, so the result says what actually happened.
  publish_post: {
    pollIntervalMs: 5000,
    statusMessage: "Publishing to your channels.",
    async run({ args, call, progress, cancelled }) {
      const queued = await call("publish_post", args);
      if (queued.isError) return queued;
      const deadline = Date.now() + PUBLISH_WAIT_MS;
      let latest: CallToolResult = queued;
      let failures = 0;
      while (Date.now() < deadline) {
        await sleep(5000);
        if (await cancelled()) {
          return new TaskCancelled("Stopped waiting for the result. Publishing carries on; check it with get_post.");
        }
        const post = await call("get_post", { postId: args.postId }).catch(() => undefined);
        if (!post || post.isError) {
          if (++failures >= MAX_READ_FAILURES) return latest;
          continue;
        }
        failures = 0;
        latest = post;
        const status = (post.structuredContent as { status?: unknown } | undefined)?.status;
        if (typeof status === "string" && POST_DONE.has(status)) return post;
        await progress(
          status === "processing"
            ? "Accepted by the platforms; waiting for them to finish processing."
            : "Publishing to your channels."
        );
      }
      // Still going after the wait: hand back the latest state rather than
      // fail, since nothing went wrong. The post keeps publishing.
      return latest;
    },
  },
  // retry_post is a task only when the retry was refused because a
  // destination is unconfirmed AND the client can show the question. Every
  // other retry (automated ones included) answers exactly as before, and a
  // client that cannot ask still gets the refusal and can pass republish.
  retry_post: {
    pollIntervalMs: 2000,
    statusMessage: "Waiting for you to check whether the post is already live.",
    async prepare({ args, call, canAsk }) {
      const first = await call("retry_post", args);
      // The refusal changes nothing on the server, so trying first is free.
      if (!first.isError || !canAsk || args.republish === true) return first;
      return (await unconfirmedScope(call, args)) ? undefined : first;
    },
    async run({ args, call, cancelled, ask }) {
      const scope = await unconfirmedScope(call, args);
      // Settled in the meantime (another retry, or the platform caught up):
      // the ordinary retry now says what to do.
      if (!scope || !ask) return call("retry_post", args);
      const answer = await ask("confirm-not-live", unconfirmedQuestion(scope), UNCONFIRMED_WAIT_MS);
      if (answer === "cancelled") return new TaskCancelled("Not retried, so nothing was posted twice.");
      if (answer === "timeout") return new TaskCancelled("No answer, so it was not retried. Nothing was posted twice.");
      if (answer.action !== "accept" || answer.content?.notLive !== true) {
        return new TaskCancelled("Not retried, so nothing was posted twice.");
      }
      // An acknowledged cancel wins over the answer; and the answer covers
      // only the destinations it was asked about.
      if (await cancelled()) return new TaskCancelled("Not retried, so nothing was posted twice.");
      const now = await unconfirmedScope(call, args);
      if (!now) return call("retry_post", args);
      if (now.key !== scope.key) {
        return new TaskCancelled("Which platforms are unconfirmed changed while you were checking, so it was not retried. Retry again to see the new list.");
      }
      return call("retry_post", { ...args, republish: true });
    },
  },
};

const ElicitAnswerSchema = z.object({
  action: z.enum(["accept", "decline", "cancel"]),
  content: z.record(z.string(), z.unknown()).optional(),
});

function rpcError(code: number, message: string, data?: unknown): Error {
  return Object.assign(new Error(message), { code, ...(data !== undefined && { data }) });
}

function declaresTasks(ctx: unknown): boolean {
  const caps = clientCaps(ctx) as { extensions?: Record<string, unknown> } | undefined;
  return !!caps?.extensions && Object.hasOwn(caps.extensions, TASKS_EXTENSION);
}

// On 2026-07-28 the SDK lifts the per-request _meta claims into
// mcpReq.envelope, keyed by their full names; _meta is the fallback.
function clientCaps(ctx: unknown): Record<string, unknown> | undefined {
  const req = (ctx as { mcpReq?: { _meta?: Record<string, unknown>; envelope?: Record<string, unknown> } })?.mcpReq;
  return (req?.envelope?.[CLIENT_CAPABILITIES_KEY] ?? req?._meta?.[CLIENT_CAPABILITIES_KEY]) as Record<string, unknown> | undefined;
}

// Form elicitation, per the capability schema: an empty `elicitation: {}`
// means form; otherwise `form` must be present.
function canShowForms(ctx: unknown): boolean {
  const e = clientCaps(ctx)?.elicitation;
  if (!e || typeof e !== "object" || Array.isArray(e)) return false;
  return Object.keys(e).length === 0 || "form" in e;
}

function wire(task: TaskRecord): Record<string, unknown> {
  const { owner: _o, tool: _t, version: _v, presumedDead: _p, inputRequests, ...rest } = task;
  // inputRequests is on the wire only while the task is waiting for input.
  return task.status === "input_required" && inputRequests ? { ...rest, inputRequests } : rest;
}

/**
 * Adds the tasks extension to one 2026-07-28 server instance. Call after every
 * tool is registered and before the server connects.
 */
export function installTasks(
  mcp: McpServer,
  opts: { store: TaskStore; caller: () => string | undefined; tools?: Record<string, TaskToolSpec> }
): void {
  const tools = opts.tools ?? TASK_TOOLS;
  const low = mcp.server as unknown as {
    registerCapabilities(c: object): void;
    setRequestHandler(method: string, schemas: { params: z.ZodTypeAny }, h: (p: any, ctx: unknown) => unknown): void;
    _requestHandlers: Map<string, (request: any, ctx: unknown) => Promise<unknown>>;
  };
  const sdkToolsCall = low._requestHandlers?.get("tools/call");
  if (typeof sdkToolsCall !== "function") {
    // Either no tools are registered or the SDK moved its handler map.
    throw new Error("installTasks: no tools/call handler to wrap — update src/tasks.ts for this SDK version.");
  }
  low.registerCapabilities({ extensions: { [TASKS_EXTENSION]: {} } });

  const store = opts.store;

  // tools/call: sits OUTSIDE the SDK's own wrapper (which checks every result
  // against the CallToolResult schema and would reject a task handle), so a
  // task returns its handle as-is and every other call is the SDK's, untouched.
  low._requestHandlers.set("tools/call", async (request, ctx) => {
    const name = request?.params?.name;
    const spec = typeof name === "string" && Object.hasOwn(tools, name) ? tools[name] : undefined;
    const callerKey = opts.caller();
    // No key, no owner to bind the task to: answer the ordinary way.
    if (!spec || !callerKey || !declaresTasks(ctx)) return sdkToolsCall(request, ctx);

    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    if (spec.prepare) {
      // Runs inside the live request, through the normal path: whatever it
      // returns is the ordinary answer to this call, so no task is created.
      const direct: CallTool = (toolName, toolArgs) =>
        sdkToolsCall({ ...request, params: { ...request.params, name: toolName, arguments: toolArgs } }, ctx) as Promise<CallToolResult>;
      const answered = await spec.prepare({ args, call: direct, canAsk: canShowForms(ctx) });
      if (answered) return answered;
    }
    const now = new Date().toISOString();
    const task: TaskRecord = {
      taskId: randomUUID(),
      owner: ownerOf(callerKey),
      tool: name,
      status: "working",
      statusMessage: spec.statusMessage,
      createdAt: now,
      lastUpdatedAt: now,
      ttlMs: TASK_TTL_MS,
      pollIntervalMs: spec.pollIntervalMs,
      version: 1,
    };
    try {
      await store.create(task);
    } catch (err) {
      // No durable task, no handle: answer the call the ordinary way instead.
      console.error("Task store unavailable; answering synchronously:", (err as Error).message);
      return sdkToolsCall(request, ctx);
    }

    // Each step goes through the SDK's normal tools/call path, so validation,
    // output schemas and structuredContent are exactly what a synchronous call
    // would produce. `ctx` belongs to a request that has already been answered
    // by the time these run: nothing may be sent on it, so the progress token
    // that would invite progress notifications is dropped.
    const { progressToken: _pt, ...meta } = (request.params?._meta ?? {}) as Record<string, unknown>;
    const call: CallTool = (toolName, toolArgs) =>
      sdkToolsCall(
        { ...request, params: { ...request.params, _meta: meta, name: toolName, arguments: toolArgs } },
        ctx
      ) as Promise<CallToolResult>;

    // The worker's writes run one at a time and each is a compare-and-set, so
    // a heartbeat cannot write a finished task back to "working", and nothing
    // overwrites a verdict it did not see.
    let chain: Promise<boolean> = Promise.resolve(true);
    const save = (patch: Partial<TaskRecord>, terminal = false): Promise<boolean> =>
      (chain = chain.catch(() => false).then(async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          const cur = await store.get(task.taskId);
          if (!cur) return false; // expired
          // A working task takes any update. A task tasks/get gave up for dead
          // takes only the worker's real result, which is truer than the guess.
          if (!ACTIVE.has(cur.status) && !(terminal && cur.presumedDead)) return false;
          const next: TaskRecord = {
            ...cur, error: undefined, presumedDead: undefined, ...patch,
            lastUpdatedAt: new Date().toISOString(), version: cur.version + 1,
          };
          if (await store.replace(next)) return true;
        }
        return false;
      }));
    // The result must not be lost to a brief store outage: retry the final
    // write with backoff before giving up (then tasks/get reports it stale).
    const finish = async (patch: Partial<TaskRecord>) => {
      for (const wait of [0, 1000, 3000, 10_000, 30_000]) {
        if (wait) await sleep(wait);
        try {
          await save(patch, true);
          return;
        } catch {
          /* store unreachable; try again */
        }
      }
      console.error(`Task ${task.taskId}: could not record its result.`);
    };
    const ask: Ask | undefined = canShowForms(ctx)
        ? async (key, params, timeoutMs) => {
            if (!(await save({ status: "input_required", statusMessage: "Waiting for your confirmation.", inputRequests: { [key]: { method: "elicitation/create", params } } }))) {
              return "cancelled"; // the task is no longer active
            }
            const until = Date.now() + timeoutMs;
            let outcome: ElicitAnswer | "cancelled" | "timeout" = "timeout";
            while (Date.now() < until) {
              await sleep(1000);
              if (await store.cancelRequested(task.taskId).catch(() => false)) { outcome = "cancelled"; break; }
              const a = (await store.getAnswer(task.taskId, key).catch(() => undefined)) as ElicitAnswer | undefined;
              if (a && typeof a === "object" && ["accept", "decline", "cancel"].includes(a.action)) { outcome = a; break; }
            }
            // Back to working, the question withdrawn (its key is never reused).
            // If that write is refused the task is no longer ours to finish:
            // tasks/get may already have reported it failed, so going on to
            // publish would contradict what the client was told.
            if (!(await save({ status: "working", statusMessage: undefined, inputRequests: undefined }))) return "cancelled";
            return outcome;
          }
        : undefined;
    const heartbeat = setInterval(() => void save({}).catch(() => {}), HEARTBEAT_MS);
    heartbeat.unref?.();

    // Detached: this promise outlives the request. It keeps the caller's
    // AsyncLocalStorage context, so every API call inside still uses their key.
    void spec
      .run({
        args,
        call,
        progress: (m) => save({ statusMessage: m }).then(() => {}, () => {}),
        cancelled: () => store.cancelRequested(task.taskId).catch(() => false),
        ask,
      })
      .then(
        (out) => {
          clearInterval(heartbeat);
          // A tool result, isError or not, completes the task (spec: failed
          // is only for JSON-RPC errors).
          return out instanceof TaskCancelled
            ? finish({ status: "cancelled", statusMessage: out.message, inputRequests: undefined })
            : finish({ status: "completed", statusMessage: undefined, inputRequests: undefined, result: out });
        },
        (err: { code?: number; message?: string }) => {
          clearInterval(heartbeat);
          const code = typeof err?.code === "number" ? err.code : INTERNAL_ERROR;
          const message = err?.message || "The task failed.";
          return finish({ status: "failed", statusMessage: message, inputRequests: undefined, error: { code, message } });
        }
      );

    return { resultType: "task", ...wire(task) };
  });

  // Every tasks/* call: the extension must be declared on the request, the
  // task must exist, and it must belong to this caller. A task that is not the
  // caller's is reported exactly like one that does not exist.
  const load = async (taskId: string, ctx: unknown): Promise<TaskRecord> => {
    if (!declaresTasks(ctx)) {
      throw rpcError(MISSING_CLIENT_CAPABILITY, "Missing required client capability", {
        requiredCapabilities: { extensions: { [TASKS_EXTENSION]: {} } },
      });
    }
    const callerKey = opts.caller();
    const task = callerKey ? await store.get(taskId).catch(() => undefined) : undefined;
    if (!task || !callerKey || task.owner !== ownerOf(callerKey)) {
      throw rpcError(INVALID_PARAMS, "Failed to retrieve task: Task not found");
    }
    return task;
  };
  const byId = z.object({ taskId: z.string() }).passthrough();

  low.setRequestHandler("tasks/get", { params: byId }, async ({ taskId }, ctx) => {
    let task = await load(taskId, ctx);
    if (ACTIVE.has(task.status) && Date.now() - Date.parse(task.lastUpdatedAt) > STALE_AFTER_MS) {
      const dead: TaskRecord = {
        ...task, status: "failed", inputRequests: undefined, statusMessage: STALE_MESSAGE,
        error: { code: INTERNAL_ERROR, message: STALE_MESSAGE }, presumedDead: true,
        lastUpdatedAt: new Date().toISOString(), version: task.version + 1,
      };
      // Compare-and-set: if the worker wrote in the meantime it is alive, and
      // its write stands; report the fresh record instead.
      const won = await store.replace(dead).catch(() => false);
      task = won ? dead : ((await store.get(taskId).catch(() => undefined)) ?? task);
    }
    return { resultType: "complete", ...wire(task) };
  });

  // Answers: only for keys the task is currently asking; the spec says to
  // ignore anything else (never issued, already answered, withdrawn). Each
  // answer is stored on its own key, never by rewriting the task record.
  low.setRequestHandler(
    "tasks/update",
    // The SDK lifts inputResponses out of params into ctx.mcpReq before this
    // runs (dropping entries shaped like a request or a {result} wrapper).
    { params: byId.extend({ inputResponses: z.record(z.string(), z.unknown()).optional() }) },
    async ({ taskId, inputResponses: inParams }, ctx) => {
      const task = await load(taskId, ctx);
      const answers =
        ((ctx as { mcpReq?: { inputResponses?: Record<string, unknown> } })?.mcpReq?.inputResponses ?? inParams ?? {}) as Record<string, unknown>;
      if (task.status === "input_required" && task.inputRequests) {
        for (const [key, answer] of Object.entries(answers)) {
          if (!Object.hasOwn(task.inputRequests, key)) continue;
          // Only a well-formed elicitation answer takes the slot; anything
          // else is ignored, so it cannot block a valid answer sent after it.
          if (!ElicitAnswerSchema.safeParse(answer).success) continue;
          try {
            await store.putAnswer(task, key, answer);
          } catch {
            // Not stored: say so, so the client sends it again.
            throw rpcError(INTERNAL_ERROR, "Could not record the answer. Send it again.");
          }
        }
      }
      return { resultType: "complete" };
    }
  );

  // Cooperative: sets a flag the worker reads (publish_post while waiting);
  // never rewrites the task record, so it cannot race the final result.
  low.setRequestHandler("tasks/cancel", { params: byId }, async ({ taskId }, ctx) => {
    const task = await load(taskId, ctx);
    if (ACTIVE.has(task.status)) await store.requestCancel(task).catch(() => {});
    return { resultType: "complete" };
  });
}
