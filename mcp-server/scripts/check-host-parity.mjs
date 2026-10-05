#!/usr/bin/env node
// ChatGPT and Claude read the same server. ChatGPT-only behaviour is carried in
// `openai/*` keys, which Claude ignores — so if the surface with every
// `openai/*` key removed is byte-identical to the committed snapshot, Claude
// sees exactly what it saw before. Covers initialize, tools/list,
// resources/list and each ui:// resource's metadata, for every profile
// (core, inbox, full). The core snapshot is the surface both directories
// approved: any change to it — a name, a schema, a description, an
// annotation — fails here.
//
// Widget HTML is NOT compared: panel code changes reach both hosts, so those
// are checked by rendering them as a plain host (`npm run preview`).
//
// The second half validates the `openai/*` keys themselves against the
// extension spec (entrypoint tools must accept {}, display modes must be ones
// ChatGPT renders), since nothing else checks them before the directory scan.
//
//   npm run build && node scripts/check-host-parity.mjs [--update]
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Read at module load: one changes which tools register, the other the panel
// CSP. The snapshot is of the defaults, so a caller's shell must not decide it.
delete process.env.BULKPUBLISH_HIDE_BILLING;
delete process.env.R2_UPLOAD_ORIGIN;
const { createServer } = await import("../dist/index.js");

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const UPDATE = process.argv.includes("--update");
const ENTRYPOINT_TYPES = new Set(["global", "thread"]);
const DISPLAY_MODES = new Set(["inline", "fullscreen"]);

async function surface(profile) {
  const server = createServer({ profile });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "parity", version: "0" });
  await Promise.all([client.connect(ct), server.connect(st)]);
  const { tools } = await client.listTools();
  const { resources } = await client.listResources();
  const contents = [];
  for (const r of resources) {
    const res = await client.readResource({ uri: r.uri });
    for (const c of res.contents) {
      const { text, blob, ...rest } = c;
      contents.push(rest);
    }
  }
  const out = {
    serverInfo: client.getServerVersion(),
    capabilities: client.getServerCapabilities(),
    tools,
    resources,
    contents,
  };
  await client.close();
  return out;
}

function stripOpenAi(value) {
  if (Array.isArray(value)) return value.map(stripOpenAi);
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (!k.startsWith("openai/")) out[k] = stripOpenAi(v);
    }
    return out;
  }
  return value;
}

function checkOpenAiKeys(s, profile) {
  const errors = [];
  for (const t of s.tools) {
    const ui = t._meta?.["openai/ui"];
    if (!ui) continue;
    const eps = ui.entrypoints;
    if (!Array.isArray(eps) || eps.length === 0 || eps.length > 3) {
      errors.push(`${t.name}: openai/ui.entrypoints must list 1-3 entrypoints`);
      continue;
    }
    for (const ep of eps) {
      if (!ENTRYPOINT_TYPES.has(ep?.type)) errors.push(`${t.name}: unsupported entrypoint type ${JSON.stringify(ep?.type)}`);
    }
    if (!t._meta?.ui?.resourceUri) errors.push(`${t.name}: entrypoint tool has no ui.resourceUri`);
    if (t.inputSchema?.required?.length) errors.push(`${t.name}: entrypoints open with {} but inputSchema requires ${t.inputSchema.required.join(", ")}`);
    if (!t.title) errors.push(`${t.name}: entrypoint tool needs a title (shown in the sidebar)`);
  }
  for (const c of s.contents) {
    const ui = c._meta?.["openai/ui"];
    if (!ui) continue;
    const avail = ui.availableDisplayModes ?? [];
    for (const m of avail) if (!DISPLAY_MODES.has(m)) errors.push(`${c.uri}: unsupported display mode ${m}`);
    if (ui.preferredDisplayMode) {
      if (!DISPLAY_MODES.has(ui.preferredDisplayMode)) errors.push(`${c.uri}: unsupported preferredDisplayMode ${ui.preferredDisplayMode}`);
      if (avail.length && !avail.includes(ui.preferredDisplayMode)) errors.push(`${c.uri}: preferredDisplayMode is not in availableDisplayModes`);
    }
  }
  return errors.map((e) => `${profile}: ${e}`);
}

const SUMMARY = (s) =>
  s.tools
    .filter((t) => t._meta?.["openai/ui"])
    .map((t) => `${t.name} → ${t._meta["openai/ui"].entrypoints.map((e) => e.type).join("+")}`)
    .join(", ") || "none";

let failed = false;
mkdirSync(FIXTURES, { recursive: true });
for (const profile of ["core", "inbox", "full"]) {
  const s = await surface(profile);
  const file = join(FIXTURES, `claude-surface.${profile}.json`);
  const actual = JSON.stringify(stripOpenAi(s), null, 2) + "\n";
  if (UPDATE) {
    writeFileSync(file, actual);
    console.log(`${profile}: snapshot written (${s.tools.length} tools)`);
  } else {
    let expected;
    try {
      expected = readFileSync(file, "utf8");
    } catch {
      console.error(`${profile}: no snapshot at ${file} — run with --update on a known-good build`);
      failed = true;
      continue;
    }
    if (expected !== actual) {
      const a = actual.split("\n");
      const e = expected.split("\n");
      const i = a.findIndex((line, n) => line !== e[n]);
      console.error(`${profile}: the surface Claude reads changed (first difference at line ${i + 1} of ${file}):`);
      console.error(`  expected: ${e[i]?.trim()}`);
      console.error(`  actual:   ${a[i]?.trim()}`);
      console.error("  If the change is intended for BOTH hosts, re-run with --update and review the diff.");
      failed = true;
    } else {
      console.log(`${profile}: Claude surface unchanged (${s.tools.length} tools)`);
    }
  }
  const errors = checkOpenAiKeys(s, profile);
  for (const e of errors) console.error(e);
  if (errors.length) failed = true;
  else console.log(`${profile}: openai/* keys valid — entrypoints: ${SUMMARY(s)}`);
}
process.exit(failed ? 1 : 0);
