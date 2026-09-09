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
import { createServer, CORE_TOOLS, TOOL_ANNOTATIONS } from "../dist/index.js";

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

for (const profile of ["core", "full"]) {
  const tools = await listTools(profile);
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
  if (profile === "core") {
    for (const n of CORE_TOOLS) if (!names.has(n)) fail(`core: ${n} listed in CORE_TOOLS but not registered`);
    for (const n of names) if (!CORE_TOOLS.has(n)) fail(`core: ${n} registered but not in CORE_TOOLS`);
    for (const n of WIDGET_CALLBACKS) if (!names.has(n)) fail(`core: panel callback ${n} missing — a widget button would break`);
  }
  console.log(`${profile}: ${tools.length} tools, all annotated`);
}

if (process.argv.includes("--table")) {
  const tools = await listTools(process.argv.includes("--full") ? "full" : "core");
  const b = (v) => (v ? "true" : "false");
  console.log("\n| Tool | readOnly | destructive | idempotent | openWorld | Justification |\n|---|---|---|---|---|---|");
  for (const t of tools) {
    const a = t.annotations;
    console.log(`| \`${t.name}\` | ${b(a.readOnlyHint)} | ${b(a.destructiveHint)} | ${b(a.idempotentHint)} | ${b(a.openWorldHint)} | ${TOOL_ANNOTATIONS[t.name].why} |`);
  }
}
process.exit(failed ? 1 : 0);
