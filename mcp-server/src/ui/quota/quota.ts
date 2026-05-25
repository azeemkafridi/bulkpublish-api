/**
 * BulkPublish Quota Usage — MCP App View.
 *
 * Runs inside the host's sandboxed iframe. It receives quota/usage data from
 * the `view_quota` tool result (structuredContent) and renders a list of
 * labelled progress bars — one per {used, limit} pair it can find in the
 * response. The iframe holds no credentials — every server call is proxied by
 * the host and runs with the server's API key.
 */
import "./quota.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

/* ─── DOM refs ──────────────────────────────────────────────────── */

const quotaEl = document.querySelector(".quota") as HTMLElement;
const subEl = document.getElementById("sub") as HTMLElement;
const bodyEl = document.getElementById("quota-body") as HTMLElement;
const emptyEl = document.getElementById("quota-empty") as HTMLElement;

/* ─── state ─────────────────────────────────────────────────────── */

let loaded = false;

/* ─── types ─────────────────────────────────────────────────────── */

interface UsagePair {
  label: string;
  used: number;
  limit: number | null; // null = unlimited
  isBytes: boolean;
}

/* ─── helpers ───────────────────────────────────────────────────── */

/** Turn a camelCase / dot.separated key into a human-readable label. */
function humanizeLabel(raw: string): string {
  // Labels coming from the server loader are already human-readable (e.g.
  // "API keys", "Media storage") — don't re-process them into "A P I Keys".
  if (/\s/.test(raw)) return raw;
  // Strip common suffixes that will be inferred from context
  let s = raw
    .replace(/([A-Z])/g, " $1") // camelCase → words
    .replace(/[._\-]/g, " ")     // separators → space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

  // Capitalise every word
  s = s.replace(/\b\w/g, (c) => c.toUpperCase());

  return s;
}

/** Returns true if a limit value should be treated as "unlimited". */
function isUnlimited(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v === "unlimited" || v === "" || v === "-1";
  if (typeof v === "number") return v <= 0; // 0 and -1 both mean unlimited
  return false;
}

/** Format a byte count as KB / MB / GB. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Walk an object (nested or flat) and extract every {used, limit} pair it can
 * find, returning an array of UsagePair.
 *
 * Handles two shapes:
 *
 *   Nested:
 *     { posts: { daily: { used, limit }, monthly: { used, limit } },
 *       channels: { used, limit }, storage: { usedBytes, limitBytes } }
 *
 *   Flat:
 *     { postsUsed, postsLimit, channelsUsed, channelsLimit,
 *       storageUsedBytes, storageLimitBytes }
 */
function extractPairs(
  obj: Record<string, unknown>,
  prefix = "",
): UsagePair[] {
  const pairs: UsagePair[] = [];

  // ── try to read this object itself as a {used, limit} pair ──────
  const keys = Object.keys(obj);
  const hasUsed = keys.some((k) => k === "used" || k === "usedBytes");
  const hasLimit = keys.some(
    (k) => k === "limit" || k === "limitBytes" || k === "limitMb",
  );

  if (hasUsed && hasLimit) {
    const used = Number(obj.used ?? obj.usedBytes ?? 0);
    const rawLimit = obj.limit ?? obj.limitBytes ?? obj.limitMb ?? null;
    const unlimited = isUnlimited(rawLimit);
    const isBytes =
      "usedBytes" in obj ||
      "limitBytes" in obj ||
      prefix.toLowerCase().includes("storage") ||
      prefix.toLowerCase().includes("byte");

    // If limitMb is present convert to bytes
    let limit = unlimited ? null : Number(rawLimit);
    if (!unlimited && "limitMb" in obj && limit !== null) {
      limit = limit * 1024 * 1024;
    }

    pairs.push({
      label: humanizeLabel(prefix || "Usage"),
      used: isBytes ? used : used,
      limit,
      isBytes,
    });
    return pairs; // don't recurse further into this leaf
  }

  // ── look for flat xUsed / xLimit pairs ──────────────────────────
  const flatUsedKeys = keys.filter(
    (k) => k.endsWith("Used") || k.endsWith("usedBytes"),
  );
  const consumedFlatKeys = new Set<string>();

  for (const usedKey of flatUsedKeys) {
    const base = usedKey.replace(/Used$/, "").replace(/usedBytes$/, "Bytes");
    const limitKey =
      `${base}Limit` in obj
        ? `${base}Limit`
        : `${base}limitBytes` in obj
          ? `${base}limitBytes`
          : `${base}LimitBytes` in obj
            ? `${base}LimitBytes`
            : null;

    if (!limitKey) continue;

    const used = Number(obj[usedKey] ?? 0);
    const rawLimit = obj[limitKey] ?? null;
    const unlimited = isUnlimited(rawLimit);
    const isBytes =
      usedKey.toLowerCase().includes("byte") ||
      base.toLowerCase().includes("storage");

    consumedFlatKeys.add(usedKey);
    consumedFlatKeys.add(limitKey);

    pairs.push({
      label: humanizeLabel(prefix ? `${prefix} ${base}` : base),
      used,
      limit: unlimited ? null : Number(rawLimit),
      isBytes,
    });
  }

  // ── recurse into child objects (skip keys already consumed) ──────
  for (const key of keys) {
    if (consumedFlatKeys.has(key)) continue;
    const val = obj[key];
    if (!val || typeof val !== "object" || Array.isArray(val)) continue;

    const childPrefix = prefix ? `${prefix}.${key}` : key;
    const childPairs = extractPairs(
      val as Record<string, unknown>,
      childPrefix,
    );
    pairs.push(...childPairs);
  }

  return pairs;
}

/**
 * Fallback: if no {used, limit} pairs were found, collect every
 * top-level number/string value from the usage object as key→value rows.
 */
function extractFlatKV(
  obj: Record<string, unknown>,
): Array<{ key: string; value: string }> {
  return Object.entries(obj)
    .filter(([, v]) => typeof v === "number" || typeof v === "string")
    .map(([k, v]) => ({ key: humanizeLabel(k), value: String(v) }));
}

/* ─── rendering ─────────────────────────────────────────────────── */

function renderRow(pair: UsagePair): HTMLElement {
  const unlimited = pair.limit === null;
  const ratio = unlimited ? 0 : Math.min(pair.used / (pair.limit || 1), 1);
  const danger = !unlimited && ratio > 0.9;

  const usedStr = pair.isBytes ? formatBytes(pair.used) : String(pair.used);
  const limitStr = unlimited
    ? "∞"
    : pair.isBytes
      ? formatBytes(pair.limit!)
      : String(pair.limit);

  const row = document.createElement("div");
  row.className = "quota-row";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", pair.label);

  const top = document.createElement("div");
  top.className = "quota-row__top";

  const label = document.createElement("span");
  label.className = "quota-row__label";
  label.textContent = pair.label;

  const value = document.createElement("span");
  value.className = "quota-row__value";
  value.textContent = `${usedStr} / ${limitStr}`;

  top.appendChild(label);
  top.appendChild(value);

  const track = document.createElement("div");
  track.className = "quota-row__track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuenow", String(pair.used));
  track.setAttribute(
    "aria-valuemax",
    unlimited ? "∞" : String(pair.limit),
  );
  track.setAttribute("aria-label", pair.label);

  const fill = document.createElement("div");
  const fillClasses = ["quota-row__fill"];
  if (unlimited) fillClasses.push("quota-row__fill--unlimited");
  if (danger) fillClasses.push("quota-row__fill--danger");
  fill.className = fillClasses.join(" ");
  fill.style.width = `${Math.round(ratio * 100)}%`;

  track.appendChild(fill);
  row.appendChild(top);
  row.appendChild(track);

  return row;
}

function renderKVRow(entry: { key: string; value: string }): HTMLElement {
  const row = document.createElement("div");
  row.className = "quota__kv-row";

  const key = document.createElement("span");
  key.className = "quota__kv-key";
  key.textContent = entry.key;

  const val = document.createElement("span");
  val.className = "quota__kv-val";
  val.textContent = entry.value;

  row.appendChild(key);
  row.appendChild(val);
  return row;
}

function render(data: unknown): void {
  loaded = true;
  quotaEl.removeAttribute("aria-busy");
  bodyEl.innerHTML = "";
  emptyEl.hidden = true;

  // Unwrap structuredContent envelope: { usage: {...} } or bare usage object
  let usage: Record<string, unknown> | null = null;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    usage =
      d.usage && typeof d.usage === "object"
        ? (d.usage as Record<string, unknown>)
        : d;
  }

  if (!usage || Object.keys(usage).length === 0) {
    emptyEl.hidden = false;
    subEl.textContent = "No data";
    return;
  }

  // Update subtitle with plan name if present
  const plan = usage.plan;
  if (typeof plan === "string" && plan) {
    const capitalized = plan.charAt(0).toUpperCase() + plan.slice(1);
    subEl.textContent = capitalized;
  } else {
    subEl.textContent = "Current plan";
  }

  // Extract pairs — exclude the `plan` string field from the walk
  const walkable = Object.fromEntries(
    Object.entries(usage).filter(([k]) => k !== "plan"),
  );
  const pairs = extractPairs(walkable);

  if (pairs.length > 0) {
    const list = document.createElement("div");
    list.className = "quota__body";
    for (const pair of pairs) {
      list.appendChild(renderRow(pair));
    }
    bodyEl.appendChild(list);
    return;
  }

  // Fallback: flat key/value display
  const kv = extractFlatKV(walkable);
  if (kv.length > 0) {
    const kvWrap = document.createElement("div");
    kvWrap.className = "quota__kv";
    for (const entry of kv) {
      kvWrap.appendChild(renderKVRow(entry));
    }
    bodyEl.appendChild(kvWrap);
    return;
  }

  // Nothing renderable
  emptyEl.hidden = false;
  subEl.textContent = "No data";
}

/* ─── app wiring ─────────────────────────────────────────────────── */

const app = new App({ name: "Quota usage", version: "1.0.0" });

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.classList.toggle(
      "theme-dark",
      ctx.theme === "dark",
    );
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

// The `view_quota` tool result delivers quota data as its structuredContent.
app.addEventListener("toolresult", (params) => {
  render(params.structuredContent);
});

app.addEventListener("hostcontextchanged", applyHostContext);
app.onerror = (e) => console.error("[quota]", e);

/* ─── connect + fallback ─────────────────────────────────────────── */

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if the opening tool-result didn't carry quota data, fetch it
  // directly so the widget still populates.
  window.setTimeout(async () => {
    if (loaded) return;
    try {
      const res = await app.callServerTool({
        name: "view_quota",
        arguments: {},
      });
      render(res.structuredContent);
    } catch (e) {
      console.error("[quota] view_quota fallback failed", e);
      quotaEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load quota";
      emptyEl.hidden = false;
    }
  }, 300);
});
