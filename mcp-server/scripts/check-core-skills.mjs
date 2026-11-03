#!/usr/bin/env node
// Validates a generated skill set against the tool profile it ships with:
// skills/core-profile-skills (core), skills/inbox-profile-skills (inbox) and
// skills/social-media-content-skills (full). The sets are generated from
// skills/src by build-skills.mjs; this checks what they say.
//
// Why prose matters as much as tool names: rss-to-social named no tool at all —
// it said "use BulkPublish RSS tools" — so a tool-name scan passed it while its
// entire purpose was impossible on the core server. Both checks below exist
// because that one shipped into a submission zip before it was caught.
//
//   cd mcp-server && node scripts/check-core-skills.mjs [--profile core|inbox|full] [dir]
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../dist/index.js";
import { factProblems } from "./lib/facts.mjs";

const pi = process.argv.indexOf("--profile");
const PROFILE = pi > -1 ? process.argv[pi + 1] : "core";
const DIRS = { core: "core-profile-skills", inbox: "inbox-profile-skills", full: "social-media-content-skills" };
const positional = process.argv.slice(2).filter((a, i, all) => a !== "--profile" && all[i - 1] !== "--profile");
const DIR = positional[0]
  ? path.resolve(positional[0])
  : path.resolve(import.meta.dirname, `../../skills/${DIRS[PROFILE]}`);

async function toolList(profile) {
  const s = createServer({ profile });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "check", version: "1" });
  await Promise.all([s.connect(a), c.connect(b)]);
  const t = (await c.listTools()).tools;
  await c.close();
  return t;
}
const tools = await toolList(PROFILE);
const core = new Set(tools.map((t) => t.name));
const all = (await toolList("full")).map((t) => t.name);

// Capabilities some profiles cannot perform at all, by the words that promise
// them and the tool that delivers them. Prose promising one sends the model
// looking for a tool that is not there.
const ABSENT = [
  [/\brss\b|autopost|feed item/i, "RSS automation", "create_rss_feed"],
  [/\bquota\b|plan limits|remaining usage/i, "quota lookup", "get_quota_usage"],
  [/recurring schedule|create_schedule/i, "recurring schedules", "create_schedule"],
  [/channel sets\b|saved channel set/i, "channel sets", "create_channel_set"],  // plural: "a channel set" of posts is ordinary English
  [/hashtag group/i, "hashtag groups", "create_hashtag_group"],
  [/saved template|post template/i, "templates", "create_template"],
  [/calendar note/i, "calendar notes", "create_calendar_note"],
  [/review link|client connect/i, "review / connect links", "create_review_link"],
  [/\bsearch_mentions\b|mention lookup/i, "mention lookup", "search_mentions"],
  [/channel health/i, "channel health", "get_channel_health"],
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
    if (new RegExp("\\b" + t + "\\b").test(txt) && !core.has(t)) fail(`${d}: names ${t}, absent from the ${PROFILE} profile`);
  }
  const body = txt.slice(fm[0].length);
  for (const [re, label, tool] of ABSENT) if (!core.has(tool) && re.test(body)) fail(`${d}: promises ${label}, absent from ${PROFILE}`);
  for (const p of factProblems(body, tools)) fail(`${d}: ${p}`);
  const stack = body.replace(/`r2Key`/g, "").match(STACK);
  if (stack) fail(`${d}: names "${stack[0]}" (stack disclosure)`);
}
console.log(`${PROFILE}-profile-skills: ${dirs.length} skills checked against ${core.size} ${PROFILE} tools`);
process.exit(failed ? 1 : 0);
