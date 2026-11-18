import { createHash } from "node:crypto";

// File types this process has already been told, so create_post can check a
// post against each platform's media rules without asking the API again.
//
// create_post used to look up every attached file with GET /api/media/{id}.
// Each lookup counted against the caller's daily API allowance, so on the free
// plan (10 calls a day) uploading five photos and creating a post ran out of
// calls during the lookups, and the 429 that followed was reported as
// "Media ID ___ not found". Every upload, finalize, get and list response
// already names each file's type, so we keep what they said instead.
//
// Entries are scoped to the caller's API key (hashed, never stored as is): the
// hosted server serves many accounts from one process.

const MAX_ENTRIES = 5000;
const types = new Map<string, string>();

function scope(apiKey: string | undefined): string {
  if (!apiKey) return "-";
  return createHash("sha256").update(apiKey).digest("hex").slice(0, 16);
}

function remember(prefix: string, record: unknown): void {
  if (!record || typeof record !== "object") return;
  const { id, mimeType } = record as { id?: unknown; mimeType?: unknown };
  if (typeof id !== "number" || typeof mimeType !== "string" || !mimeType) return;
  const key = `${prefix}:${id}`;
  // Re-insert so the Map's order is least-recently-seen first.
  types.delete(key);
  types.set(key, mimeType);
  if (types.size > MAX_ENTRIES) {
    const oldest = types.keys().next().value;
    if (oldest !== undefined) types.delete(oldest);
  }
}

/** Record the types named in a media response: `{ file }`, `{ files: [...] }`, or a bare record. */
export function rememberMediaTypes(apiKey: string | undefined, data: unknown): void {
  if (!data || typeof data !== "object") return;
  const prefix = scope(apiKey);
  const d = data as { file?: unknown; files?: unknown };
  remember(prefix, d.file);
  if (Array.isArray(d.files)) for (const f of d.files) remember(prefix, f);
  remember(prefix, data);
}

/**
 * The types of `ids`, or null when any of them has not been seen. A partial
 * answer is never returned: judging a post on some of its files would
 * misreport it (a video the cache missed would read as "TikTok needs a video").
 */
export function knownMediaTypes(
  apiKey: string | undefined,
  ids: number[]
): Array<{ id: number; mimeType: string }> | null {
  const prefix = scope(apiKey);
  const out: Array<{ id: number; mimeType: string }> = [];
  for (const id of ids) {
    const mimeType = types.get(`${prefix}:${id}`);
    if (!mimeType) return null;
    out.push({ id, mimeType });
  }
  return out;
}

/** Test hook. */
export function clearMediaTypes(): void {
  types.clear();
}
