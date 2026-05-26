/**
 * BulkPublish Posts — MCP App View.
 *
 * Renders the `view_posts` list as cards: content + a ⋮ actions menu on top,
 * then a status row (status badge left, creation date right). The menu offers
 * status-appropriate actions wired to the host bridge — Publish now
 * (publish_post), Retry (retry_post), Schedule/Reschedule (update_post), Delete
 * (delete_post) — and refreshes the list after each.
 */
import "./posts.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { platformIcon, platformBg } from "../composer/platform-icons";

/* ----------------------------- types ----------------------------- */

type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "partial";

type PostChannel = string | { platform: string; accountName?: string };

type Post = {
  id?: number;
  content?: string;
  status?: PostStatus;
  scheduledAt?: string;
  createdAt?: string;
  channels?: PostChannel[];
  platforms?: string[];
};

type PostsData = { posts?: Post[]; total?: number };

type Action = "publish" | "retry" | "schedule" | "delete";

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

const ACTION_LABELS: Record<Action, string> = {
  publish: "Publish now",
  retry: "Retry",
  schedule: "Schedule",
  delete: "Delete",
};

const ACTION_TOOL: Record<Action, string> = {
  publish: "publish_post",
  retry: "retry_post",
  schedule: "update_post",
  delete: "delete_post",
};

const CONTENT_MAX = 160;

/** Which actions a post supports, given its status. */
function actionsFor(status: string): Action[] {
  switch (status) {
    case "draft": return ["publish", "schedule", "delete"];
    case "scheduled": return ["publish", "schedule"];
    case "failed": return ["retry", "publish", "delete"];
    case "partial": return ["retry", "delete"];
    default: return []; // publishing, published → no actions
  }
}

/* ----------------------------- DOM refs ----------------------------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const postsEl = document.querySelector(".posts") as HTMLElement;
const subEl = $("sub");
const listEl = $("posts-list");
const emptyEl = $("posts-empty");
const toastEl = document.createElement("div");
toastEl.className = "posts__toast";
document.body.appendChild(toastEl);

/* ----------------------------- state ----------------------------- */

const app = new App({ name: "Posts", version: "1.0.0" });
let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let busy = false;
let openMenu: HTMLElement | null = null;

/* ----------------------------- helpers ----------------------------- */

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max).trimEnd() + "…";
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

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseToolText(result: CallToolResult): unknown {
  const block = result.content?.find((c) => c.type === "text") as
    | { text?: string }
    | undefined;
  if (!block?.text) return undefined;
  try {
    return JSON.parse(block.text);
  } catch {
    return block.text;
  }
}

function errMessage(parsed: unknown, fallback: string): string {
  if (typeof parsed === "string" && parsed) return parsed;
  const o = parsed as { error?: { message?: string }; message?: string } | undefined;
  return o?.error?.message || o?.message || fallback;
}

function platformsFromPost(post: Post): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: unknown) => {
    let platform: string | undefined;
    if (typeof raw === "string") platform = raw;
    else if (raw && typeof raw === "object") platform = (raw as Record<string, unknown>).platform as string | undefined;
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
    case "failed": return "badge--error";
    case "partial": return "badge--warning";
    default: return "badge--neutral";
  }
}

function showToast(msg: string, isError: boolean): void {
  toastEl.textContent = msg;
  toastEl.className = `posts__toast posts__toast--${isError ? "error" : "ok"} show`;
  window.setTimeout(() => toastEl.classList.remove("show"), 3800);
}

/* ----------------------------- actions ----------------------------- */

function closeMenu(): void {
  if (openMenu) {
    openMenu.remove();
    openMenu = null;
  }
}

async function refresh(): Promise<void> {
  try {
    const res = await app.callServerTool({ name: "view_posts", arguments: {} });
    render(res.structuredContent);
  } catch {
    /* keep current view */
  }
}

async function runAction(
  post: Post,
  action: Action,
  scheduledAt?: string
): Promise<void> {
  if (busy || post.id == null) return;
  busy = true;
  closeMenu();
  const args: Record<string, unknown> = { postId: post.id };
  if (action === "schedule") {
    args.status = "scheduled";
    args.scheduledAt = scheduledAt;
    args.timezone = timeZone;
  }
  try {
    const res = await app.callServerTool({ name: ACTION_TOOL[action], arguments: args });
    const parsed = parseToolText(res);
    if (res.isError) {
      showToast(errMessage(parsed, `${ACTION_LABELS[action]} failed`), true);
    } else {
      const done: Record<Action, string> = {
        publish: `Publishing #${post.id}…`,
        retry: `Retrying #${post.id}…`,
        schedule: `Scheduled #${post.id} ✓`,
        delete: `Deleted #${post.id} ✓`,
      };
      showToast(done[action], false);
      await refresh();
    }
  } catch (e) {
    showToast(e instanceof Error ? e.message : "Action failed", true);
  } finally {
    busy = false;
  }
}

function openActionsMenu(card: HTMLElement, post: Post, actions: Action[]): void {
  if (openMenu && openMenu.dataset.for === String(post.id)) {
    closeMenu();
    return;
  }
  closeMenu();
  const menu = document.createElement("div");
  menu.className = "post-menu";
  menu.dataset.for = String(post.id);
  menu.addEventListener("click", (e) => e.stopPropagation());

  for (const a of actions) {
    const item = document.createElement("button");
    item.type = "button";
    item.className =
      "post-menu__item" + (a === "delete" ? " post-menu__item--danger" : "");
    item.textContent =
      a === "schedule" && post.status === "scheduled" ? "Reschedule" : ACTION_LABELS[a];
    item.addEventListener("click", () => {
      if (a === "schedule") showScheduleStep(menu, post);
      else void runAction(post, a);
    });
    menu.appendChild(item);
  }
  card.appendChild(menu);
  openMenu = menu;
}

function showScheduleStep(menu: HTMLElement, post: Post): void {
  menu.innerHTML = "";
  menu.classList.add("post-menu--schedule");
  const input = document.createElement("input");
  input.type = "datetime-local";
  input.className = "post-menu__input";
  input.min = toLocalInput(new Date());
  if (post.scheduledAt) {
    const d = new Date(post.scheduledAt);
    if (!isNaN(d.getTime())) input.value = toLocalInput(d);
  }
  const set = document.createElement("button");
  set.type = "button";
  set.className = "post-menu__item post-menu__set";
  set.textContent = "Set time";
  set.addEventListener("click", () => {
    if (!input.value) return;
    void runAction(post, "schedule", new Date(input.value).toISOString());
  });
  menu.appendChild(input);
  menu.appendChild(set);
  input.focus();
}

/* ----------------------------- rendering ----------------------------- */

function renderPost(post: Post): HTMLElement {
  const card = document.createElement("article");
  card.className = "post-card";
  card.setAttribute("role", "listitem");

  const status = post.status ?? "draft";
  const platforms = platformsFromPost(post);
  const actions = post.id != null ? actionsFor(status) : [];

  // top row: content (left) + ⋮ menu (right, where the status used to be)
  const top = document.createElement("div");
  top.className = "post-card__top";
  const content = document.createElement("p");
  content.className = "post-card__content";
  const raw = post.content ?? "";
  content.innerHTML = raw
    ? escapeHtml(truncate(raw, CONTENT_MAX))
    : `<span class="post-card__no-content">No content</span>`;
  top.appendChild(content);

  if (actions.length) {
    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "post-card__menu-btn";
    menuBtn.setAttribute("aria-label", "Post actions");
    menuBtn.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>`;
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      openActionsMenu(card, post, actions);
    });
    top.appendChild(menuBtn);
  }
  card.appendChild(top);

  // platform chips — brand icon (mirrors the composer) + label
  if (platforms.length) {
    const chips = document.createElement("div");
    chips.className = "chips chips--sm";
    for (const p of platforms) {
      const chip = document.createElement("span");
      chip.className = "chip chip--sm";
      chip.style.setProperty("--icon-bg", platformBg(p));
      const icon = platformIcon(p);
      chip.innerHTML =
        `<span class="chip__icon">${icon || `<span class="chip__dot"></span>`}</span>` +
        `<span class="chip__label">${escapeHtml(PLATFORM_LABELS[p] ?? p)}</span>`;
      chips.appendChild(chip);
    }
    card.appendChild(chips);
  }

  // status row: status badge (left) + creation date (right)
  const statusRow = document.createElement("div");
  statusRow.className = "post-card__status-row";
  const badge = document.createElement("span");
  badge.className = `badge ${statusClass(status)}`;
  badge.textContent = STATUS_LABELS[status] ?? status;
  statusRow.appendChild(badge);

  const created = formatDate(post.createdAt);
  const sched = status === "scheduled" ? formatDate(post.scheduledAt) : null;
  const dateText = sched ? `Scheduled ${sched}` : created;
  if (dateText) {
    const dateEl = document.createElement("span");
    dateEl.className = "post-card__date";
    dateEl.textContent = dateText;
    statusRow.appendChild(dateEl);
  }
  card.appendChild(statusRow);

  return card;
}

function render(data: unknown): void {
  closeMenu();
  const d = (data ?? {}) as PostsData;
  const posts = Array.isArray(d.posts) ? d.posts : [];
  const total = typeof d.total === "number" ? d.total : posts.length;

  postsEl.removeAttribute("aria-busy");
  subEl.textContent = total === 0 ? "No posts yet" : `${total} post${total === 1 ? "" : "s"}`;
  listEl.innerHTML = "";

  if (posts.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;
  for (const post of posts) {
    if (post && typeof post === "object") listEl.appendChild(renderPost(post as Post));
  }
}

/* ----------------------------- app wiring ----------------------------- */

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.classList.toggle("theme-dark", ctx.theme === "dark");
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.timeZone) timeZone = ctx.timeZone;
}

app.addEventListener("toolresult", (params) => render(params.structuredContent));
app.addEventListener("hostcontextchanged", applyHostContext);
app.onerror = (e) => console.error("[posts]", e);

// Close the actions menu on any outside click.
document.addEventListener("click", () => closeMenu());

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  window.setTimeout(async () => {
    if (!postsEl.hasAttribute("aria-busy")) return; // already rendered
    try {
      const res = await app.callServerTool({ name: "view_posts", arguments: {} });
      render(res.structuredContent);
    } catch (e) {
      console.error("[posts] view_posts fallback failed", e);
      postsEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load posts";
    }
  }, 300);
});
