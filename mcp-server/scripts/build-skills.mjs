#!/usr/bin/env node
// Writes every published copy of the skills from the one source in skills/src.
//
// There used to be four hand-edited copies (core, inbox, full, and the AI
// toolkit's), and each carried fixes the others lacked: the core copy still
// said approvals could not be done after approve_post joined core, the full
// copy named a TikTok post type that does not exist, and the toolkit's plan
// table was two plan changes old. A fact now lives in exactly one file.
//
// Source format (skills/src/<name>/):
//   SKILL.md            the template, or SKILL.<profile>.md when a profile's
//                       copy is a genuinely different document
//   frontmatter         name, description, profiles: core, inbox, full
//                       (which copies get it), optional description.<profile>
//   <<<full: text ||| core,inbox: other>>>
//                       per-profile text; a profile not named gets nothing.
//                       On its own lines it is a block and leaves no blank line.
//   {{post-types}}      the post-type table, read from create_post's schema
//   {{media-rules}}     the media rules the prompts state (src/prompts.ts)
//
// Outputs: skills/core-profile-skills (core), skills/inbox-profile-skills
// (inbox, minus what core already has), skills/social-media-content-skills
// (full), and the AI toolkit's skills/ (full) when that repo is beside this one.
//
//   npm run build && node scripts/build-skills.mjs           write every copy
//   node scripts/build-skills.mjs --check                    fail if any copy differs
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

delete process.env.R2_UPLOAD_ORIGIN;
const { createServer } = await import("../dist/index.js");
const { MEDIA_RULES } = await import("../dist/prompts.js");

const ROOT = path.resolve(import.meta.dirname, "../../skills");
const SRC = path.join(ROOT, "src");
const TOOLKIT = path.resolve(import.meta.dirname, "../../../bulkpublish-ai-toolkit/skills");
const CHECK = process.argv.includes("--check");
const PROFILES = ["core", "inbox", "full"];
const NOTICE = "<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->";

const PLATFORM_LABELS = {
  facebook: "Facebook", instagram: "Instagram", x: "X", tiktok: "TikTok", youtube: "YouTube",
  threads: "Threads", bluesky: "Bluesky", linkedin: "LinkedIn", pinterest: "Pinterest",
  gmb: "Google Business", mastodon: "Mastodon", discord: "Discord", telegram: "Telegram",
  tumblr: "Tumblr", snapchat: "Snapchat",
};

async function toolsFor(profile) {
  const s = createServer({ profile });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const c = new Client({ name: "build-skills", version: "1" });
  await Promise.all([s.connect(a), c.connect(b)]);
  const tools = (await c.listTools()).tools;
  await c.close();
  return tools;
}

/** platform -> [post types, default first], straight from create_post's schema. */
export function postTypesFrom(tools) {
  const create = tools.find((t) => t.name === "create_post");
  const props = create.inputSchema.properties.postTypeOverrides.properties;
  return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.enum ?? v.anyOf?.find((x) => x.enum)?.enum ?? []]));
}

function postTypeTable(types) {
  const rows = Object.entries(types).map(([p, list]) =>
    `| ${PLATFORM_LABELS[p] ?? p} | \`${p}\` | ${list.map((t) => `\`${t}\``).join(", ")} |`);
  return ["| Platform | Key | `postTypeOverrides` values |", "|---|---|---|", ...rows].join("\n");
}

/** Resolve <<<profiles: text ||| profiles: text>>> for one profile. */
export function selectProfile(text, profile) {
  let out = "";
  let i = 0;
  for (;;) {
    const start = text.indexOf("<<<", i);
    if (start < 0) { out += text.slice(i); return out; }
    const end = text.indexOf(">>>", start);
    if (end < 0) throw new Error(`unclosed <<< at offset ${start}`);
    const ownLine = (start === 0 || text[start - 1] === "\n") && (text[end + 3] === "\n" || end + 3 === text.length);
    let chosen = "";
    for (const alt of text.slice(start + 3, end).split("|||")) {
      const m = alt.match(/^\s*([a-z,]+):([\s\S]*)$/);
      if (!m) throw new Error(`bad alternative "${alt.slice(0, 40)}" (want "profiles: text")`);
      const names = m[1].split(",");
      for (const n of names) if (!PROFILES.includes(n)) throw new Error(`unknown profile "${n}"`);
      if (names.includes(profile)) { chosen = m[2]; break; }
    }
    if (ownLine) {
      // Block form: drop the newline after "profile:" and before ">>>".
      chosen = chosen.replace(/^ ?\n/, "").replace(/\n\s*$/, "");
      out += text.slice(i, start) + chosen;
      i = end + 3;
      if (!chosen) i += 1; // swallow the construct's own line break
    } else {
      out += text.slice(i, start) + chosen.replace(/^ /, "").replace(/ $/, "");
      i = end + 3;
    }
  }
}

function parse(file) {
  const txt = readFileSync(file, "utf8");
  const fm = txt.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) throw new Error(`${file}: no frontmatter`);
  const meta = {};
  for (const line of fm[1].split("\n")) {
    const m = line.match(/^([\w.]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return { meta, body: txt.slice(fm[0].length) };
}

function render(src, profile, types) {
  const { meta, body } = src;
  let out = selectProfile(body, profile)
    .replaceAll("{{post-types}}", postTypeTable(types))
    .replaceAll("{{media-rules}}", MEDIA_RULES);
  const left = out.match(/\{\{[^}]+\}\}|<<<|>>>/);
  if (left) throw new Error(`${meta.name}/${profile}: unresolved "${left[0]}"`);
  // An empty inline alternative can leave a space at the end of a line.
  out = out.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n");
  const description = meta[`description.${profile}`] ?? meta.description;
  return `---\nname: ${meta.name}\ndescription: ${description}\n---\n${NOTICE}\n${out.replace(/^\n?/, "\n")}`;
}

// ---- Build every copy in memory ----
const sources = readdirSync(SRC).filter((d) => !d.startsWith("_") && statSync(path.join(SRC, d)).isDirectory()).sort();
const typesByProfile = {};
for (const p of PROFILES) typesByProfile[p] = postTypesFrom(await toolsFor(p));

/** profile -> name -> text */
const built = { core: {}, inbox: {}, full: {} };
for (const name of sources) {
  const dir = path.join(SRC, name);
  const base = existsSync(path.join(dir, "SKILL.md")) ? parse(path.join(dir, "SKILL.md")) : null;
  const profiles = (base?.meta.profiles ?? parse(path.join(dir, readdirSync(dir).find((f) => /^SKILL\.\w+\.md$/.test(f)))).meta.profiles ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!profiles.length) throw new Error(`${name}: no profiles`);
  for (const p of profiles) {
    if (!PROFILES.includes(p)) throw new Error(`${name}: unknown profile ${p}`);
    const variant = path.join(dir, `SKILL.${p}.md`);
    const src = existsSync(variant) ? parse(variant) : base;
    if (!src) throw new Error(`${name}: no SKILL.md or SKILL.${p}.md`);
    if (src.meta.name !== name) throw new Error(`${name}: frontmatter name "${src.meta.name}"`);
    built[p][name] = render(src, p, typesByProfile[p]);
  }
}
// The inbox folder ships beside core, so it holds only what core lacks.
for (const n of Object.keys(built.inbox)) if (built.core[n]) delete built.inbox[n];

// Each folder in this repo gets a README listing what it holds, written from the
// skills' own descriptions so the list cannot drift either.
const INTROS = {
  core: "The skill set for the hosted connector at `mcp.bulkpublish.com/mcp`, which serves the `core` tool profile. Every skill here uses only tools that profile serves. The ChatGPT plugin package is built from this folder.",
  inbox: "Skills that need the Inbox and comment tools, served under the `inbox` profile (`BULKPUBLISH_TOOL_PROFILE=inbox`). Ship them beside `../core-profile-skills` to a connector running that profile, never to one running `core`.",
  full: "The skill set for the full tool profile: the npm/stdio server and `mcp.bulkpublish.com/mcp/full`. The AI toolkit's `skills/` folder is a copy of this one.",
};
function readme(profile, want) {
  const rows = Object.entries(want).sort().map(([n, t]) => `| [\`${n}\`](${n}/SKILL.md) | ${t.match(/^description: (.*)$/m)[1]} |`);
  return `# ${{ core: "Core", inbox: "Inbox", full: "Full" }[profile]}-profile skills\n\n${NOTICE}\n\n${INTROS[profile]}\n\n` +
    "Every file here is generated from `../src`. Edit the source and run `cd mcp-server && npm run build:skills`; `npm run check:skills` fails on a copy that differs, on a tool the profile does not serve, and on a post type or parameter the server does not accept.\n\n" +
    `| Skill | What it is for |\n|---|---|\n${rows.join("\n")}\n`;
}

const targets = [
  ["core", path.join(ROOT, "core-profile-skills"), true],
  ["inbox", path.join(ROOT, "inbox-profile-skills"), true],
  ["full", path.join(ROOT, "social-media-content-skills"), true],
];
if (existsSync(TOOLKIT)) targets.push(["full", TOOLKIT, true]);
else console.warn(`note: ${TOOLKIT} not found, the AI toolkit copy was not ${CHECK ? "checked" : "written"}`);

let drift = 0;
for (const [profile, dir, withReadme] of targets) {
  const want = built[profile];
  const have = existsSync(dir)
    ? readdirSync(dir).filter((d) => existsSync(path.join(dir, d, "SKILL.md")))
    : [];
  for (const stale of have.filter((d) => !want[d])) {
    if (CHECK) { drift++; console.error(`DRIFT ${dir}/${stale}: not in skills/src for ${profile}`); }
    else rmSync(path.join(dir, stale), { recursive: true });
  }
  for (const [name, text] of Object.entries(want)) {
    const file = path.join(dir, name, "SKILL.md");
    const cur = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (cur === text) continue;
    if (CHECK) { drift++; console.error(`DRIFT ${file}: differs from skills/src (run npm run build:skills)`); }
    else { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, text); }
  }
  if (withReadme) {
    const file = path.join(dir, "README.md");
    const text = readme(profile, want);
    if (!existsSync(file) || readFileSync(file, "utf8") !== text) {
      if (CHECK) { drift++; console.error(`DRIFT ${file}: differs from skills/src`); }
      else writeFileSync(file, text);
    }
  }
  console.log(`${profile} -> ${path.relative(path.resolve(ROOT, ".."), dir) || dir}: ${Object.keys(want).length} skills`);
}
process.exit(drift ? 1 : 0);
