#!/usr/bin/env node
// Boots the built server in both profiles over an in-memory transport and
// asserts what the directory reviews check: every listed tool has a title and
// all four hints as explicit booleans, and every core tool a panel calls back
// into is present in the core profile. With --table it prints the
// justification table for the OpenAI / Anthropic submission forms, generated
// from the same map the server ships, so the form cannot drift from the server.
//
//   npm run build && node scripts/check-annotations.mjs [--table]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, CORE_TOOLS, INBOX_TOOLS, TOOL_ANNOTATIONS, TOOL_OUTPUT_SCHEMAS } from "../dist/index.js";
import { z } from "zod";

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
// Tools the MCP Apps panels call through the host bridge (src/ui/**).
const WIDGET_CALLBACKS = [
  "create_post", "get_post", "publish_post", "retry_post", "update_post", "delete_post",
  "list_channels", "list_media", "create_media_upload", "finalize_media_upload",
];

async function listTools(profile) {
  const server = createServer({ profile });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "check", version: "0" });
  await Promise.all([client.connect(ct), server.connect(st)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

let failed = 0;
const fail = (m) => { failed++; console.error("FAIL " + m); };

// Output schemas must accept what the API actually returns. The SDK rejects the
// WHOLE call when structuredContent fails validation, so a schema that is one
// field too strict turns a saved post into a reported error (create_post with
// media, 2026-09-11 — the post existed, the host saw a failure, a retry would
// have duplicated it). These rows are traced from the webapp handlers: POST and
// PATCH /api/posts echo the stored row (media as IDs); GET resolves objects.
const OUTPUT_FIXTURES = {
  create_post: { id: 2276, content: "x", status: "scheduled", scheduledAt: "2026-09-18T18:00:00.000Z", mediaFiles: [3056], postPlatforms: [{ platform: "x", status: "pending" }], labels: [] },
  update_post: { id: 2276, status: "scheduled", mediaFiles: [3056, 3057], postPlatforms: [], labels: [] },
  get_post: { id: 2276, status: "published", mediaFiles: [{ id: 3056, url: "https://images.example/x.jpg" }], postPlatforms: [{ platform: "x", status: "published", platformUrl: "https://x.com/1" }], labels: [{ id: 1, name: "Product" }] },
  publish_post: { id: 1, status: "publishing", mediaFiles: [], postPlatforms: [{ platform: "facebook", status: "pending" }] },
  list_posts: { posts: [{ id: 1, mediaFiles: [] }, { id: 2, mediaFiles: [{ id: 5 }] }], total: 2, page: 1, limit: 20, totalPages: 1 },
  get_queue_slot: { scheduledAt: "2026-09-11T14:11:02.530Z", dayLabel: "Today" },
  upload_media: { file: { id: 3056, fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 127085, width: 1200, height: 630 } },
  list_channels: { channels: [{ id: 143, platform: "instagram", accountName: "Acme Studio", isActive: true, needsReconnect: false }] },
  // Inbox profile — shapes from the webapp's openapi.json responses.
  list_conversations: { conversations: [{ id: 7, platform: "instagram", kind: "dm", rating: null, status: "open", snoozedUntil: null, assignee: null, channel: { id: 143, accountName: "Acme", profileImage: null }, participant: { id: "p1", name: "Sam" }, unreadCount: 2, lastMessageAt: "2026-10-05T10:00:00.000Z", lastInboundAt: "2026-10-05T10:00:00.000Z", lastMessagePreview: "Hi", canReply: true, attachments: { max: 1, kinds: ["image"] }, replyNotice: null }], nextCursor: null, offset: 0, total: 1 },
  get_conversation: { conversationId: 7, messages: [{ id: 1, platformMessageId: "m1", direction: "in", text: null, attachments: null, rating: null, sentAt: "2026-10-05T10:00:00.000Z", readAt: null, actor: null, authorUserId: null, author: null, parentId: null, likeCount: null }] },
  reply_to_conversation: { success: true, messageId: "m2" },
  update_conversation: { success: true },
  list_post_comments: { postId: 9, platforms: [{ postPlatformId: 4, platform: "x", accountName: "Acme", platformPostId: "1", platformUrl: null, engagement: { comments: [{ id: "c1", text: "nice" }], reactions: [], commentActions: ["like"] } }, { platform: "tiktok", accountName: null, platformPostId: null, platformUrl: null, engagement: null, error: "Could not load engagement for this platform." }] },
  reply_to_comment: { success: true, replyId: null, accountName: null },
  moderate_comment: { success: true, action: "hide" },
};
for (const [tool, fixture] of Object.entries(OUTPUT_FIXTURES)) {
  const shape = TOOL_OUTPUT_SCHEMAS[tool];
  if (!shape) { fail(`${tool}: no output schema`); continue; }
  const res = z.object(shape).passthrough().safeParse(fixture);
  if (!res.success) fail(`${tool}: output schema rejects a real API response — ${JSON.stringify(res.error.issues[0])}`);
}

const byProfile = {};
for (const profile of ["core", "inbox", "full"]) {
  const tools = await listTools(profile);
  byProfile[profile] = tools;
  for (const t of tools) {
    if (!t.title) fail(`${profile}/${t.name}: no title`);
    if (!t.description || t.description.length < 20) fail(`${profile}/${t.name}: description too short`);
    for (const h of HINTS) {
      if (typeof t.annotations?.[h] !== "boolean") fail(`${profile}/${t.name}: ${h} is ${t.annotations?.[h]} (must be true|false)`);
    }
    if (t.annotations?.readOnlyHint && t.annotations?.destructiveHint) fail(`${profile}/${t.name}: readOnly and destructive both true`);
    if (!TOOL_ANNOTATIONS[t.name]?.why) fail(`${profile}/${t.name}: no justification`);
  }
  const names = new Set(tools.map((t) => t.name));
  if (profile === "core" || profile === "inbox") {
    // Every hosted tool declares an outputSchema: OpenAI's review flags the ones
    // that don't. Declaring one obliges the handler to return structuredContent
    // (the SDK rejects the call otherwise), so the two ship together.
    for (const t of tools) {
      if (!t.outputSchema) fail(`${profile}: ${t.name}: no outputSchema`);
    }
    const expected = new Set(profile === "core" ? CORE_TOOLS : [...CORE_TOOLS, ...INBOX_TOOLS]);
    for (const n of expected) if (!names.has(n)) fail(`${profile}: ${n} expected in the profile but not registered`);
    for (const n of names) if (!expected.has(n)) fail(`${profile}: ${n} registered but not in the profile's tool list`);
    for (const n of WIDGET_CALLBACKS) if (!names.has(n)) fail(`${profile}: panel callback ${n} missing — a widget button would break`);
  }
  if (profile === "inbox" || profile === "full") {
    // Core is what both directories approved. Serving it inside a larger
    // profile must not change a byte of any core tool: name, title,
    // description, input and output schemas, annotations, _meta.
    for (const c of byProfile.core) {
      const t = tools.find((x) => x.name === c.name);
      if (!t) fail(`${profile}: core tool ${c.name} missing`);
      else if (JSON.stringify(t) !== JSON.stringify(c)) fail(`${profile}: core tool ${c.name} differs from the core profile`);
    }
    for (const n of INBOX_TOOLS) if (!names.has(n)) fail(`${profile}: inbox tool ${n} missing`);
  }
  console.log(`${profile}: ${tools.length} tools, all annotated`);
}

if (process.argv.includes("--table")) {
  const tools = await listTools(process.argv.includes("--full") ? "full" : process.argv.includes("--inbox") ? "inbox" : "core");
  const b = (v) => (v ? "true" : "false");
  console.log("\n| Tool | readOnly | destructive | idempotent | openWorld | Justification |\n|---|---|---|---|---|---|");
  for (const t of tools) {
    const a = t.annotations;
    console.log(`| \`${t.name}\` | ${b(a.readOnlyHint)} | ${b(a.destructiveHint)} | ${b(a.idempotentHint)} | ${b(a.openWorldHint)} | ${TOOL_ANNOTATIONS[t.name].why} |`);
  }
}
process.exit(failed ? 1 : 0);
