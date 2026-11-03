#!/usr/bin/env node
// Renders every prompt the server lists, in every profile, hosted and local,
// and fails when a prompt would send the model after something the instance
// cannot do: a tool name it does not serve, a feature its profile lacks, or a
// vendor name a user should never read.
//
// HIDE_BILLING is read at module load, so run once more with it set:
//   npm run build && node scripts/check-prompts.mjs
//   BULKPUBLISH_HIDE_BILLING=1 node scripts/check-prompts.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

delete process.env.R2_UPLOAD_ORIGIN;
const { createServer, TOOL_ANNOTATIONS } = await import("../dist/index.js");
const { allPrompts } = await import("../dist/prompts.js");
const { factProblems } = await import("./lib/facts.mjs");

const ALL_TOOLS = Object.keys(TOOL_ANNOTATIONS);
// Features absent from the trimmed profiles, by the words that promise them.
const ABSENT = [
  [/\brss\b|autopost|feed item/i, "RSS automation", "create_rss_feed"],
  [/\bquota\b|plan usage|storage this frees/i, "quota lookup", "get_quota_usage"],
  [/recurring schedule/i, "recurring schedules", "create_schedule"],
  [/channel sets?\b/i, "channel sets", "create_channel_set"],
  [/hashtag group/i, "hashtag groups", "create_hashtag_group"],
  [/saved template|caption template|first-comment snippet/i, "templates", "create_template"],
  [/calendar note|on the calendar with/i, "calendar notes", "create_calendar_note"],
  [/review link|connect link/i, "review / connect links", "create_review_link"],
  [/alt text/i, "alt text", "update_media"],
  [/as a story right away/i, "story publishing", "publish_story"],
];
const STACK = /\b(r2|cloudflare|bullmq|redis|postgres|drizzle|astro|resend|polar|dokploy|ghcr|express|presigned)\b/i;
const hideBilling = process.env.BULKPUBLISH_HIDE_BILLING === "1";

let failed = 0;
const fail = (m) => { failed++; console.error("FAIL " + m); };

// Definitions themselves: unique names, every required tool exists.
const seen = new Set();
for (const p of allPrompts()) {
  if (seen.has(p.name)) fail(`duplicate prompt name ${p.name}`);
  seen.add(p.name);
  if (!p.requires.length) fail(`${p.name}: requires no tool`);
  for (const t of p.requires) if (!ALL_TOOLS.includes(t)) fail(`${p.name}: requires unknown tool ${t}`);
  if (!p.description || p.description.length < 20) fail(`${p.name}: description too short`);
}

for (const profile of ["core", "inbox", "full"]) {
  for (const hosted of [true, false]) {
    const server = createServer({ profile, hosted });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "check-prompts", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const toolDefs = (await client.listTools()).tools;
    const served = new Set(toolDefs.map((t) => t.name));
    const { prompts } = await client.listPrompts();
    const tag = `${profile}${hosted ? "/hosted" : ""}${hideBilling ? "/no-billing" : ""}`;

    for (const p of prompts) {
      const def = allPrompts().find((d) => d.name === p.name);
      for (const t of def.requires) if (!served.has(t)) fail(`${tag} ${p.name}: listed without ${t}`);
      // Render twice: every argument filled, and only the required ones.
      const full = Object.fromEntries((p.arguments ?? []).map((x) => [x.name, "example value"]));
      const min = Object.fromEntries((p.arguments ?? []).filter((x) => x.required).map((x) => [x.name, "example value"]));
      for (const args of [full, min]) {
        const res = await client.getPrompt({ name: p.name, arguments: args });
        const text = res.messages.map((m) => m.content.text).join("\n");
        for (const t of ALL_TOOLS) {
          if (!served.has(t) && new RegExp(`\\b${t}\\b`).test(text)) fail(`${tag} ${p.name}: names ${t}, not served`);
        }
        for (const [re, label, tool] of ABSENT) {
          if (!served.has(tool) && re.test(text)) fail(`${tag} ${p.name}: promises ${label}, not served`);
        }
        const stack = text.replace(/`r2Key`/g, "").match(STACK);
        if (stack) fail(`${tag} ${p.name}: names "${stack[0]}" (stack disclosure)`);
        if (text.includes("undefined")) fail(`${tag} ${p.name}: renders "undefined"`);
        for (const f of factProblems(text, toolDefs)) fail(`${tag} ${p.name}: ${f}`);
      }
    }
    // A prompt left out must be one whose tools are not all served.
    for (const d of allPrompts()) {
      const listed = prompts.some((p) => p.name === d.name);
      const runnable = d.requires.every((t) => served.has(t));
      if (listed !== runnable) fail(`${tag} ${d.name}: listed=${listed} but runnable=${runnable}`);
    }
    console.log(`${tag}: ${prompts.length} prompts against ${served.size} tools`);
    await client.close();
  }
}
process.exit(failed ? 1 : 0);
