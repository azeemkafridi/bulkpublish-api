/**
 * BulkPublish Channels — MCP App View.
 *
 * Displays the user's connected channels as a responsive card grid.
 * Receives channel data from the `view_channels` tool result
 * (structuredContent) and shows per-channel status badges.
 */
import "./channels.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type Channel = {
  channelId: number;
  platform: string;
  accountName?: string;
  active?: boolean;
  status?: string;
};

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

/** Platform dot accent colours keyed by platform slug. Falls back to --stone-400. */
const PLATFORM_COLORS: Record<string, string> = {
  x: "#000000",
  instagram: "#E1306C",
  linkedin: "#0A66C2",
  facebook: "#1877F2",
  tiktok: "#69C9D0",
  youtube: "#FF0000",
  pinterest: "#E60023",
  threads: "#000000",
  bluesky: "#0085FF",
  google_business: "#4285F4",
  gmb: "#4285F4",
  mastodon: "#6364FF",
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const viewEl = document.querySelector(".channels-view") as HTMLElement;
const subEl = $("sub");
const gridEl = $("channel-grid");
const emptyEl = $("channels-empty");

let loaded = false;

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

function channelsFromAny(data: unknown): unknown {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    return o.channels ?? o.data ?? o.items;
  }
  return undefined;
}

/** Returns true for non-healthy status strings. */
function isUnhealthyStatus(status: string | undefined): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s !== "healthy" && s !== "ok" && s !== "active" && s !== "connected";
}

/* ----------------------------- rendering ----------------------------- */

function buildStatusBadge(ch: Channel): HTMLElement {
  const badge = document.createElement("span");
  badge.className = "channel-card__badge";

  // Unhealthy explicit status takes highest priority.
  if (ch.status && isUnhealthyStatus(ch.status)) {
    badge.classList.add("channel-card__badge--error");
    badge.textContent = ch.status;
    return badge;
  }

  // active flag
  if (ch.active === true) {
    badge.classList.add("channel-card__badge--success");
    badge.textContent = "Active";
  } else if (ch.active === false) {
    badge.classList.add("channel-card__badge--neutral");
    badge.textContent = "Inactive";
  } else {
    // active is absent — show status if present, else nothing
    if (ch.status) {
      badge.classList.add("channel-card__badge--neutral");
      badge.textContent = ch.status;
    } else {
      badge.hidden = true;
    }
  }

  return badge;
}

function renderChannels(channels: Channel[]): void {
  gridEl.innerHTML = "";

  if (channels.length === 0) {
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  for (const ch of channels) {
    const label = PLATFORM_LABELS[ch.platform] ?? ch.platform;
    const dotColor = PLATFORM_COLORS[ch.platform] ?? "var(--stone-400)";
    const accountName = ch.accountName ?? "—";
    const accountMuted = !ch.accountName;

    const card = document.createElement("div");
    card.className = "channel-card";
    card.setAttribute("role", "listitem");

    const dot = document.createElement("span");
    dot.className = "channel-card__dot";
    dot.style.background = dotColor;

    const platformEl = document.createElement("span");
    platformEl.className = "channel-card__platform";
    platformEl.textContent = label;

    const platformRow = document.createElement("div");
    platformRow.className = "channel-card__platform-row";
    platformRow.appendChild(dot);
    platformRow.appendChild(platformEl);

    const nameEl = document.createElement("span");
    nameEl.className =
      "channel-card__name" + (accountMuted ? " channel-card__name--muted" : "");
    nameEl.textContent = escapeHtml(accountName);
    nameEl.title = accountName;

    const badge = buildStatusBadge(ch);

    card.appendChild(platformRow);
    card.appendChild(nameEl);
    card.appendChild(badge);

    gridEl.appendChild(card);
  }
}

function ingestChannels(list: unknown): void {
  loaded = true;
  viewEl.removeAttribute("aria-busy");
  const next: Channel[] = [];

  if (Array.isArray(list)) {
    for (const raw of list) {
      if (!raw || typeof raw !== "object") continue;
      const o = raw as Record<string, unknown>;
      const id = Number(o.channelId ?? o.id);
      const platform = String(o.platform ?? "");
      if (!Number.isFinite(id) || !platform) continue;
      next.push({
        channelId: id,
        platform,
        accountName: (o.accountName ?? o.name ?? o.username) as
          | string
          | undefined,
        active:
          typeof o.active === "boolean"
            ? o.active
            : typeof o.enabled === "boolean"
              ? o.enabled
              : undefined,
        status: o.status != null ? String(o.status) : undefined,
      });
    }
  }

  subEl.textContent =
    next.length === 1
      ? "1 connected"
      : next.length > 1
        ? `${next.length} connected`
        : "No connected channels";

  renderChannels(next);
}

/* ----------------------------- app wiring ----------------------------- */

const app = new App({ name: "Channels", version: "1.0.0" });

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.classList.toggle("theme-dark", ctx.theme === "dark");
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
}

app.addEventListener("toolresult", (params) => {
  const sc = params.structuredContent as { channels?: unknown } | undefined;
  if (sc && "channels" in sc) {
    ingestChannels(sc.channels);
  }
});

app.addEventListener("hostcontextchanged", applyHostContext);
app.onerror = (e) => console.error("[channels]", e);

/* ----------------------------- connect ----------------------------- */

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if the opening tool-result didn't carry channels, fetch them
  // directly via view_channels so the grid still populates.
  window.setTimeout(async () => {
    if (loaded) return;
    try {
      const res = await app.callServerTool({
        name: "view_channels",
        arguments: {},
      });
      ingestChannels(channelsFromAny(parseToolText(res)));
    } catch (e) {
      console.error("[channels] view_channels fallback failed", e);
      viewEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load channels";
    }
  }, 300);
});
