// Checks shared by the skill and prompt checks: statements an agent would act
// on, compared with the server's own schema rather than with another document.
//
// Each rule here is a mistake that shipped. The skills once named a TikTok post
// type `slideshow` (it is `photo_slideshow`, so a post built from that table was
// refused), said TikTok privacy defaulted to SELF_ONLY (it is
// PUBLIC_TO_EVERYONE), and said YouTube and TikTok both need a video after
// TikTok slideshows started publishing.

/** Claims that were true once, or never. [pattern, what is true instead]. */
export const STALE = [
  [/(?<!photo_)`slideshow`|postTypeOverrides\.tiktok\W{0,6}slideshow\b/i, "the TikTok post type is photo_slideshow"],
  [/SELF_ONLY\W{0,4}\(default|default\W{0,12}SELF_ONLY|privacy is `?SELF_ONLY/i, "TikTok privacy defaults to PUBLIC_TO_EVERYONE"],
  [/(YouTube|TikTok)\W{1,6}(&|and)\W{1,6}(YouTube|TikTok)\W{1,4}(both\s+)?(REQUIRE|need)\w*\s+(a\s+)?video/i, "TikTok also takes 1-35 images as a photo_slideshow"],
  [/TikTok\s+(ONLY accepts video|requires? (a )?video( file)?\s*(only|—|\.))/i, "TikTok also takes 1-35 images as a photo_slideshow"],
  [/suggestedTime/, "get_queue_slot returns scheduledAt and dayLabel"],
  [/\b20 feeds\b|up to 20 per workspace|feeds per org\b/i, "RSS feeds are capped by plan (1, 3, 10, 50)"],
  [/polled every 15 minutes|feed is checked every 15 minutes/i, "RSS feeds are checked every 60, 60, 30 or 15 minutes by plan"],
  [/25,000 for long posts|25,000 long posts/i, "X posts are checked at 280 characters"],
  [/cannot approve or reject from here/i, "approve_post and reject_post are served"],
];

const PLATFORMS = ["facebook", "instagram", "x", "tiktok", "youtube", "threads", "bluesky", "linkedin",
  "pinterest", "gmb", "mastodon", "discord", "telegram", "tumblr", "snapchat"];

/**
 * Every post type named after `postTypeOverrides.<platform>` or inside a
 * `postTypeOverrides` sentence must be one the schema accepts.
 */
function postTypeProblems(text, postTypes) {
  const out = [];
  // postTypeOverrides.tiktok = "photo_slideshow" / : `reel` / 'story'
  for (const m of text.matchAll(/postTypeOverrides\.(\w+)\W{0,12}?(?:to\s+|is\s+)?[`'"]([a-z_]+)[`'"]/g)) {
    const [, p, t] = m;
    if (postTypes[p] && !postTypes[p].includes(t)) out.push(`postTypeOverrides.${p} "${t}" is not a ${p} post type (${postTypes[p].join(", ")})`);
  }
  // {"instagram": "reel", ...} right after postTypeOverrides
  for (const m of text.matchAll(/postTypeOverrides\W{0,6}\{([^}]{0,300})\}/g)) {
    for (const [, p, t] of m[1].matchAll(/"(\w+)"\s*:\s*"([a-z_]+)"/g)) {
      if (postTypes[p] && !postTypes[p].includes(t)) out.push(`postTypeOverrides {"${p}": "${t}"} is not a ${p} post type`);
    }
  }
  // "Set postTypeOverrides: instagram 'reel', facebook 'story' ..." up to the sentence end
  for (const m of text.matchAll(/postTypeOverrides(?: per platform)?:?\s+([^.\n]*)/g)) {
    let current = null;
    for (const tok of m[1].matchAll(/\b([a-z]+)\b|[`'"]([a-z_]+)[`'"]/g)) {
      if (tok[1] && PLATFORMS.includes(tok[1])) current = tok[1];
      else if (tok[2] && current && postTypes[current] && !postTypes[current].includes(tok[2])) {
        out.push(`"${tok[2]}" is not a ${current} post type (${postTypes[current].join(", ")})`);
      }
    }
  }
  return out;
}

/**
 * In a markdown table whose header names a params column, the backticked
 * parameters on a row whose first cell is a tool must exist on that tool.
 */
function paramTableProblems(text, toolsByName) {
  const out = [];
  const lines = text.split("\n");
  let paramCol = -1;
  for (const line of lines) {
    if (!line.startsWith("|")) { paramCol = -1; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const pc = cells.findIndex((c) => /^key params$|^params$|^parameters$/i.test(c));
    if (pc > -1) { paramCol = pc; continue; }
    if (paramCol < 0 || /^-+$/.test(cells[0].replace(/:/g, ""))) continue;
    const tool = cells[0].match(/^`(\w+)`$/)?.[1];
    const def = tool && toolsByName[tool];
    if (!def) continue;
    const props = Object.keys(def.inputSchema.properties ?? {});
    for (const [, p] of (cells[paramCol] ?? "").matchAll(/`(\w+)`/g)) {
      if (!props.includes(p)) out.push(`${tool} has no parameter "${p}" (has: ${props.join(", ") || "none"})`);
    }
  }
  return out;
}

const LABELS = { facebook: "facebook", instagram: "instagram", x: "x", "x/twitter": "x", twitter: "x", tiktok: "tiktok",
  youtube: "youtube", threads: "threads", bluesky: "bluesky", linkedin: "linkedin", pinterest: "pinterest",
  gmb: "gmb", "google business": "gmb", mastodon: "mastodon", discord: "discord", telegram: "telegram",
  tumblr: "tumblr", snapchat: "snapchat" };

/** A table with a "Post types" / "Types" column: every type a platform row names must exist. */
function postTypeTableProblems(text, postTypes) {
  const out = [];
  let col = -1;
  for (const line of text.split("\n")) {
    if (!line.startsWith("|")) { col = -1; continue; }
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    const hc = cells.findIndex((c) => /^(post )?types$/i.test(c));
    if (hc > 0) { col = hc; continue; }
    if (col < 0) continue;
    const p = LABELS[cells[0].replace(/`/g, "").toLowerCase()];
    if (!p || !postTypes[p]) continue;
    for (const t of (cells[col] ?? "").replace(/`/g, "").split(/,\s*/).map((x) => x.trim()).filter(Boolean)) {
      if (/^[a-z_]+$/.test(t) && !postTypes[p].includes(t)) out.push(`post-type table: "${t}" is not a ${p} post type (${postTypes[p].join(", ")})`);
    }
  }
  return out;
}

/** All fact problems in a text, for a server instance's tools. */
export function factProblems(text, tools) {
  const toolsByName = Object.fromEntries(tools.map((t) => [t.name, t]));
  const create = toolsByName.create_post;
  const pto = create?.inputSchema.properties.postTypeOverrides?.properties ?? {};
  const postTypes = Object.fromEntries(Object.entries(pto).map(([k, v]) => [k, v.enum ?? []]));
  const out = [];
  for (const [re, truth] of STALE) {
    const m = text.match(re);
    if (m) out.push(`stale claim "${m[0]}": ${truth}`);
  }
  out.push(...postTypeProblems(text, postTypes), ...postTypeTableProblems(text, postTypes), ...paramTableProblems(text, toolsByName));
  return out;
}
