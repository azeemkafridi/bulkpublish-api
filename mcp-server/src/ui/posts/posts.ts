/**
 * BulkPublish Posts — MCP App View.
 *
 * Runs inside the host's sandboxed iframe. Receives the post list from the
 * `view_posts` tool result (structuredContent) and renders a scrollable list
 * of post cards showing status, content preview, platform chips, and timestamp.
 */
import "./posts.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

/* ----------------------------- types ----------------------------- */

type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "partial";

type PostChannel =
  | string
  | { platform: string; accountName?: string };

type Post = {
  id?: number;
  content?: string;
  status?: PostStatus;
  scheduledAt?: string;
  createdAt?: string;
  channels?: PostChannel[];
  platforms?: string[];
};

type PostsData = {
  posts?: Post[];
  total?: number;
};

/* ----------------------------- constants ----------------------------- */

const PLATFORM_LABELS: Record<string, string> = {
  x: "X",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
  bluesky: "Bluesky",
  google_business: "Google Business",
  gmb: "Google Business",
  mastodon: "Mastodon",
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  partial: "Partial",
};

const CONTENT_MAX = 160;

/* ----------------------------- DOM refs ----------------------------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const postsEl = document.querySelector(".posts") as HTMLElement;
const subEl = $("sub");
const listEl = $("posts-list");
const emptyEl = $("posts-empty");

/* ----------------------------- helpers ----------------------------- */

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max).trimEnd() + "…";
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function platformsFromPost(post: Post): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (raw: unknown) => {
    if (!raw) return;
    let platform: string | undefined;
    if (typeof raw === "string") platform = raw;
    else if (typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      platform = o.platform as string | undefined;
    }
    if (platform && !seen.has(platform)) {
      seen.add(platform);
      out.push(platform);
    }
  };

  if (Array.isArray(post.channels)) post.channels.forEach(add);
  if (Array.isArray(post.platforms)) post.platforms.forEach(add);
  return out;
}

function statusClass(status: string | undefined): string {
  switch (status) {
    case "published": return "badge--success";
    case "scheduled": return "badge--scheduled";
    case "failed":    return "badge--error";
    case "partial":   return "badge--warning";
    default:          return "badge--neutral"; // draft, publishing, unknown
  }
}

/* ----------------------------- rendering ----------------------------- */

function renderPost(post: Post): HTMLElement {
  const card = document.createElement("article");
  card.className = "post-card";
  card.setAttribute("role", "listitem");

  // --- status badge ---
  const status = post.status ?? "draft";
  const badgeLabel = STATUS_LABELS[status] ?? status;
  const badge = document.createElement("span");
  badge.className = `badge ${statusClass(status)}`;
  badge.textContent = badgeLabel;

  // --- content preview ---
  const rawContent = post.content ?? "";
  const preview = truncate(rawContent, CONTENT_MAX);
  const contentEl = document.createElement("p");
  contentEl.className = "post-card__content";
  contentEl.innerHTML = preview
    ? escapeHtml(preview)
    : `<span class="post-card__no-content">No content</span>`;

  // --- platform chips ---
  const platforms = platformsFromPost(post);
  const chipsEl = document.createElement("div");
  chipsEl.className = "chips chips--sm";
  for (const platform of platforms) {
    const label = PLATFORM_LABELS[platform] ?? platform;
    const chip = document.createElement("span");
    chip.className = "chip chip--sm";
    chip.innerHTML =
      `<span class="chip__dot"></span>` +
      `<span class="chip__label">${escapeHtml(label)}</span>`;
    chipsEl.appendChild(chip);
  }

  // --- timestamp ---
  let timeText: string | null = null;
  if (status === "scheduled" && post.scheduledAt) {
    const f = formatDate(post.scheduledAt);
    if (f) timeText = `Scheduled ${f}`;
  }
  if (!timeText && post.createdAt) {
    const f = formatDate(post.createdAt);
    if (f) timeText = `Created ${f}`;
  }

  const metaEl = document.createElement("div");
  metaEl.className = "post-card__meta";

  if (platforms.length > 0) {
    metaEl.appendChild(chipsEl);
  }
  if (timeText) {
    const timeEl = document.createElement("span");
    timeEl.className = "post-card__time";
    timeEl.textContent = timeText;
    metaEl.appendChild(timeEl);
  }

  // --- assemble ---
  const topRow = document.createElement("div");
  topRow.className = "post-card__top";
  topRow.appendChild(contentEl);
  topRow.appendChild(badge);

  card.appendChild(topRow);
  if (platforms.length > 0 || timeText) {
    card.appendChild(metaEl);
  }

  return card;
}

function render(data: unknown): void {
  const d = (data ?? {}) as PostsData;
  const posts = Array.isArray(d.posts) ? d.posts : [];
  const total = typeof d.total === "number" ? d.total : posts.length;

  postsEl.removeAttribute("aria-busy");

  subEl.textContent =
    total === 0
      ? "No posts yet"
      : `${total} post${total === 1 ? "" : "s"}`;

  listEl.innerHTML = "";

  if (posts.length === 0) {
    emptyEl.hidden = false;
    return;
  }

  emptyEl.hidden = true;
  for (const post of posts) {
    if (!post || typeof post !== "object") continue;
    listEl.appendChild(renderPost(post as Post));
  }
}

/* ----------------------------- app wiring ----------------------------- */

const app = new App({ name: "Posts", version: "1.0.0" });

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.classList.toggle("theme-dark", ctx.theme === "dark");
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.addEventListener("toolresult", (params) => {
  render(params.structuredContent);
});

app.addEventListener("hostcontextchanged", applyHostContext);
app.onerror = (e) => console.error("[posts]", e);

/* ----------------------------- connect ----------------------------- */

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if the opening tool-result didn't deliver post data, fetch
  // directly so the list still populates.
  window.setTimeout(async () => {
    if (!postsEl.hasAttribute("aria-busy")) return; // already rendered
    try {
      const res = await app.callServerTool({
        name: "view_posts",
        arguments: {},
      });
      render(res.structuredContent);
    } catch (e) {
      console.error("[posts] view_posts fallback failed", e);
      postsEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load posts";
    }
  }, 300);
});
