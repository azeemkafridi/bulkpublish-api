/**
 * BulkPublish Analytics — MCP App View.
 *
 * Receives analytics data from the `view_analytics` tool result
 * (structuredContent), then renders stat cards, a per-platform bar chart,
 * and a daily sparkline — all with plain DOM + CSS, no chart libraries.
 */
import "./analytics.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/* ----------------------------- types ----------------------------- */

interface PlatformRow {
  platform: string;
  posts?: number;
  count?: number;
  published?: number;
}

interface DailyRow {
  date: string;
  count: number;
}

interface SummaryData {
  // totals — may be at the top level or nested
  total?: number;
  totalPosts?: number;
  published?: number;
  scheduled?: number;
  failed?: number;
  draft?: number;
  // nested alternatives
  statusBreakdown?: {
    published?: number;
    scheduled?: number;
    failed?: number;
    draft?: number;
  };
  byStatus?: {
    published?: number;
    scheduled?: number;
    failed?: number;
    draft?: number;
  };
  // per-platform
  byPlatform?: PlatformRow[];
  perPlatform?: PlatformRow[];
  platforms?: PlatformRow[];
  // daily
  daily?: DailyRow[];
  dailyCounts?: DailyRow[];
}

interface AnalyticsPayload {
  from?: string;
  to?: string;
  summary?: SummaryData | null;
}

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

/* ----------------------------- helpers ----------------------------- */

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

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

function safeNum(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function formatDate(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return raw;
  }
}

function formatDateRange(from: string | undefined, to: string | undefined): string {
  if (!from && !to) return "";
  if (from && to) return `${formatDate(from)} → ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  return `Up to ${formatDate(to!)}`;
}

/* ----------------------------- DOM refs ----------------------------- */

const analyticsEl = document.querySelector(".analytics") as HTMLElement;
const subEl = $("sub");
const statCardsEl = $("stat-cards");
const valPublished = $("val-published");
const valScheduled = $("val-scheduled");
const valFailed = $("val-failed");
const valTotal = $("val-total");
const sectionPlatform = $("section-platform");
const platformBarsEl = $("platform-bars");
const sectionDaily = $("section-daily");
const dailyBarsEl = $("daily-bars");
const emptyEl = $("empty");

let loaded = false;

/* ----------------------------- rendering ----------------------------- */

function renderStatCards(s: SummaryData): boolean {
  // Resolve counts from multiple possible shapes
  const statusBucket = s.statusBreakdown ?? s.byStatus ?? s;

  const published = safeNum(s.published ?? (statusBucket as SummaryData).published);
  const scheduled = safeNum(s.scheduled ?? (statusBucket as SummaryData).scheduled);
  const failed = safeNum(s.failed ?? (statusBucket as SummaryData).failed);
  const total = safeNum(s.total ?? s.totalPosts);

  const hasAny =
    published !== undefined ||
    scheduled !== undefined ||
    failed !== undefined ||
    total !== undefined;

  if (!hasAny) return false;

  valPublished.textContent = published !== undefined ? String(published) : "—";
  valScheduled.textContent = scheduled !== undefined ? String(scheduled) : "—";
  valFailed.textContent = failed !== undefined ? String(failed) : "—";
  valTotal.textContent =
    total !== undefined
      ? String(total)
      : published !== undefined
        ? String(
            (published ?? 0) +
              (scheduled ?? 0) +
              (failed ?? 0),
          )
        : "—";

  statCardsEl.hidden = false;
  return true;
}

function renderPlatformBars(s: SummaryData): boolean {
  const rows: PlatformRow[] =
    (s.byPlatform ?? s.perPlatform ?? s.platforms) as PlatformRow[] | undefined ?? [];

  if (!Array.isArray(rows) || rows.length === 0) return false;

  const counts = rows.map((r) => safeNum(r.posts ?? r.count ?? r.published) ?? 0);
  const max = Math.max(...counts, 1);

  platformBarsEl.innerHTML = "";
  rows.forEach((row, i) => {
    const count = counts[i];
    const label =
      PLATFORM_LABELS[String(row.platform ?? "").toLowerCase()] ??
      String(row.platform ?? "Unknown");
    const pct = Math.round((count / max) * 100);

    const rowEl = document.createElement("div");
    rowEl.className = "bar-row";
    rowEl.innerHTML =
      `<span class="bar-row__label">${escapeHtml(label)}</span>` +
      `<div class="bar-row__track" role="meter" aria-label="${escapeHtml(label)}: ${count} posts" aria-valuenow="${count}" aria-valuemax="${max}">` +
      `<div class="bar-row__fill" style="width:${pct}%"></div>` +
      `</div>` +
      `<span class="bar-row__count">${count}</span>`;
    platformBarsEl.appendChild(rowEl);
  });

  sectionPlatform.hidden = false;
  return true;
}

function renderDailyBars(s: SummaryData): boolean {
  const rows: DailyRow[] =
    (s.daily ?? s.dailyCounts) as DailyRow[] | undefined ?? [];

  if (!Array.isArray(rows) || rows.length === 0) return false;

  const counts = rows.map((r) => safeNum(r.count) ?? 0);
  const max = Math.max(...counts, 1);
  const showLabels = rows.length <= 14; // avoid crowding for long ranges

  dailyBarsEl.innerHTML = "";
  rows.forEach((row, i) => {
    const count = counts[i];
    const pct = Math.round((count / max) * 100);
    const dateLabel = formatDate(String(row.date ?? ""));

    const col = document.createElement("div");
    col.className = "spark-col";
    col.setAttribute("title", `${escapeHtml(String(row.date ?? ""))}: ${count}`);

    const bar = document.createElement("div");
    bar.className = "spark-bar";
    bar.setAttribute("role", "meter");
    bar.setAttribute("aria-label", `${dateLabel}: ${count}`);
    bar.setAttribute("aria-valuenow", String(count));
    bar.setAttribute("aria-valuemax", String(max));

    const fill = document.createElement("div");
    fill.className = "spark-bar__fill";
    fill.style.height = `${Math.max(pct, count > 0 ? 4 : 0)}%`;
    bar.appendChild(fill);
    col.appendChild(bar);

    if (showLabels) {
      const lab = document.createElement("span");
      lab.className = "spark-col__label";
      lab.textContent = dateLabel;
      col.appendChild(lab);
    }
    dailyBarsEl.appendChild(col);
  });

  sectionDaily.hidden = false;
  return true;
}

function render(sc: unknown): void {
  loaded = true;
  analyticsEl.removeAttribute("aria-busy");

  // Guard: must be an object
  if (!sc || typeof sc !== "object") {
    subEl.textContent = "No data available";
    emptyEl.hidden = false;
    return;
  }

  const payload = sc as AnalyticsPayload;
  const summary = payload.summary;

  // Date range subtitle
  subEl.textContent = formatDateRange(payload.from, payload.to) || "All time";

  if (!summary || typeof summary !== "object") {
    emptyEl.hidden = false;
    return;
  }

  let anySection = false;
  anySection = renderStatCards(summary) || anySection;
  anySection = renderPlatformBars(summary) || anySection;
  anySection = renderDailyBars(summary) || anySection;

  if (!anySection) {
    emptyEl.hidden = false;
  }
}

/* ----------------------------- app wiring ----------------------------- */

const app = new App({ name: "Analytics dashboard", version: "1.0.0" });

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
app.onerror = (e) => console.error("[analytics]", e);

/* ----------------------------- connect ----------------------------- */

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if no toolresult arrives within ~300ms, call the tool directly.
  window.setTimeout(async () => {
    if (loaded) return;
    try {
      const res = await app.callServerTool({
        name: "view_analytics",
        arguments: {},
      });
      // Try structuredContent first, fall back to parsing the text block.
      const sc =
        (res as { structuredContent?: unknown }).structuredContent ??
        parseToolText(res as CallToolResult);
      render(sc);
    } catch (e) {
      console.error("[analytics] view_analytics fallback failed", e);
      analyticsEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load analytics";
      emptyEl.hidden = false;
    }
  }, 300);
});
