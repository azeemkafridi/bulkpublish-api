#!/usr/bin/env node
// Validates skills/core-profile-skills against the hosted `core` tool profile.
//
// Why prose matters as much as tool names: rss-to-social named no tool at all —
// it said "use BulkPublish RSS tools" — so a tool-name scan passed it while its
// entire purpose was impossible on the core server. Both checks below exist
// because that one shipped into a submission zip before it was caught.
//
//   cd mcp-server && node scripts/check-core-skills.mjs [dir]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/index.js";

const DIR = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(import.meta.dirname, "../../skills/core-profile-skills");

async function names(profile) {
  const s = createServer({ profile });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "check", version: "1" });
  await Promise.all([s.connect(a), c.connect(b)]);
  const t = (await c.listTools()).tools.map((x) => x.name);
  await c.close();
  return t;
}
const core = new Set(await names("core"));
const all = await names("full");

// Capabilities the core profile cannot perform at all. Prose promising these
// sends the model looking for a tool that is not there.
const ABSENT = [
  [/\brss\b|autopost|feed item/i, "RSS automation"],
  [/\bquota\b|plan limits|remaining usage/i, "quota lookup"],
  [/recurring schedule|repeat post/i, "recurring schedules"],
  [/channel sets\b|saved channel set/i, "channel sets"],  // plural: "a channel set" of posts is ordinary English
  [/hashtag group/i, "hashtag groups"],
  [/saved template|post template/i, "templates"],
  [/calendar note/i, "calendar notes"],
  [/review link|client connect/i, "review / connect links"],
  [/\bsearch_mentions\b|mention lookup/i, "mention lookup"],
  [/channel health/i, "channel health"],
];
// Vendors and internals must never appear in copy a user or reviewer reads.
const STACK = /\b(r2|cloudflare|bullmq|redis|postgres|drizzle|astro|resend|polar|dokploy|ghcr|express)\b/i;

let failed = 0;
const fail = (m) => { failed++; console.error("FAIL " + m); };
const dirs = readdirSync(DIR).filter((d) => existsSync(path.join(DIR, d, "SKILL.md")));

for (const d of dirs) {
  const file = path.join(DIR, d, "SKILL.md");
  const txt = readFileSync(file, "utf8");
  const fm = txt.match(/^---\n([\s\S]*?)\n---/);
  if (!fm) { fail(`${d}: no frontmatter`); continue; }
  const name = (fm[1].match(/^name:\s*(.+)$/m) || [])[1]?.trim();
  const desc = (fm[1].match(/^description:\s*(.+)$/m) || [])[1]?.trim();
  if (name !== d) fail(`${d}: frontmatter name "${name}" != folder`);
  if (!desc || desc.length < 20) fail(`${d}: description too short`);

  for (const t of all) {
    // r2Key is a required parameter name, not prose — allow that one token.
    if (new RegExp("\\b" + t + "\\b").test(txt) && !core.has(t)) fail(`${d}: names non-core tool ${t}`);
  }
  const body = txt.slice(fm[0].length);
  for (const [re, label] of ABSENT) if (re.test(body)) fail(`${d}: promises ${label}, absent from core`);
  const stack = body.replace(/`r2Key`/g, "").match(STACK);
  if (stack) fail(`${d}: names "${stack[0]}" (stack disclosure)`);
}
console.log(`core-profile-skills: ${dirs.length} skills checked against ${core.size} core tools`);
process.exit(failed ? 1 : 0);
