/**
 * BulkPublish Composer — MCP App View.
 *
 * Runs inside the host's sandboxed iframe. It receives the connected channels
 * from the `compose_post` tool result (structuredContent), lets the user pick
 * channels / write content / optionally schedule, and on submit calls the
 * server's existing `create_post` tool via the host bridge. The iframe holds no
 * credentials — every server call is proxied by the host and runs with the
 * server's API key.
 */
import "./tokens.css";
import "./composer.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

type Channel = { channelId: number; platform: string; accountName?: string };

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

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const composerEl = document.querySelector(".composer") as HTMLElement;
const subEl = $("sub");
const channelsEl = $("channels");
const channelsEmptyEl = $("channels-empty");
const contentEl = $<HTMLTextAreaElement>("content");
const countEl = $("count");
const scheduleToggle = $<HTMLInputElement>("schedule-toggle");
const scheduleRow = $("schedule-row");
const scheduledAtEl = $<HTMLInputElement>("scheduled-at");
const tzLabelEl = $("tz-label");
const errorEl = $("error");
const successEl = $("success");
const submitBtn = $<HTMLButtonElement>("submit-btn");

let channels: Channel[] = [];
const selected = new Set<number>();
let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let loaded = false;
let submitting = false;

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

function isScheduling(): boolean {
  return scheduleToggle.checked;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
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

/* ----------------------------- rendering ----------------------------- */

function renderChannels(): void {
  channelsEl.innerHTML = "";
  if (channels.length === 0) {
    channelsEmptyEl.hidden = false;
    return;
  }
  channelsEmptyEl.hidden = true;
  for (const ch of channels) {
    const on = selected.has(ch.channelId);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = on ? "chip chip--on" : "chip";
    chip.setAttribute("aria-pressed", String(on));
    const label = PLATFORM_LABELS[ch.platform] ?? ch.platform;
    chip.innerHTML =
      `<span class="chip__dot"></span><span class="chip__label">${escapeHtml(label)}</span>` +
      (ch.accountName
        ? `<span class="chip__acct">${escapeHtml(ch.accountName)}</span>`
        : "");
    chip.addEventListener("click", () => {
      if (selected.has(ch.channelId)) selected.delete(ch.channelId);
      else selected.add(ch.channelId);
      const nowOn = selected.has(ch.channelId);
      chip.classList.toggle("chip--on", nowOn);
      chip.setAttribute("aria-pressed", String(nowOn));
      updateSubmitState();
    });
    channelsEl.appendChild(chip);
  }
}

function updateCount(): void {
  countEl.textContent = String(contentEl.value.length);
}

function updateSubmitState(): void {
  const ready =
    !submitting &&
    contentEl.value.trim().length > 0 &&
    selected.size > 0 &&
    (!isScheduling() || !!scheduledAtEl.value);
  submitBtn.disabled = !ready;
  submitBtn.textContent = submitting
    ? "Working…"
    : isScheduling()
      ? "Schedule post"
      : "Save draft";
}

function showError(msg: string): void {
  errorEl.textContent = msg;
  errorEl.hidden = false;
  successEl.hidden = true;
}
function showSuccess(msg: string): void {
  successEl.textContent = msg;
  successEl.hidden = false;
  errorEl.hidden = true;
}
function clearBanners(): void {
  errorEl.hidden = true;
  successEl.hidden = true;
}

function ingestChannels(list: unknown): void {
  loaded = true;
  composerEl.removeAttribute("aria-busy");
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
      });
    }
  }
  channels = next;
  subEl.textContent = channels.length
    ? `${channels.length} connected channel${channels.length === 1 ? "" : "s"}`
    : "No connected channels";
  renderChannels();
  updateSubmitState();
}

/* ----------------------------- app wiring ----------------------------- */

const app = new App({ name: "BulkPublish Composer", version: "1.0.0" });

function applyHostContext(ctx: McpUiHostContext): void {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
    document.documentElement.classList.toggle("theme-dark", ctx.theme === "dark");
  }
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx.styles?.css?.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx.timeZone) {
    timeZone = ctx.timeZone;
    tzLabelEl.textContent = timeZone;
  }
}

// The `compose_post` call that opened this view delivers channels (and an
// optional default timezone) as its structuredContent.
app.addEventListener("toolresult", (params) => {
  const sc = params.structuredContent as
    | { channels?: unknown; defaultTimezone?: string }
    | undefined;
  if (sc?.defaultTimezone) {
    timeZone = sc.defaultTimezone;
    tzLabelEl.textContent = timeZone;
  }
  if (sc && "channels" in sc) ingestChannels(sc.channels);
});

// If the model passed `content` to compose_post, prefill the textarea.
app.addEventListener("toolinput", (params) => {
  const args = params.arguments as { content?: string } | undefined;
  if (args?.content && !contentEl.value) {
    contentEl.value = args.content;
    updateCount();
    updateSubmitState();
  }
});

app.addEventListener("hostcontextchanged", applyHostContext);
app.onerror = (e) => console.error("[composer]", e);

/* ----------------------------- UI events ----------------------------- */

contentEl.addEventListener("input", () => {
  updateCount();
  updateSubmitState();
});

scheduleToggle.addEventListener("change", () => {
  scheduleRow.hidden = !isScheduling();
  if (isScheduling() && !scheduledAtEl.value) {
    const d = new Date(Date.now() + 60 * 60 * 1000); // default to +1 hour
    d.setSeconds(0, 0);
    scheduledAtEl.value = toLocalInput(d);
  }
  updateSubmitState();
});

scheduledAtEl.addEventListener("input", updateSubmitState);

submitBtn.addEventListener("click", async () => {
  if (submitBtn.disabled) return;
  clearBanners();
  submitting = true;
  updateSubmitState();

  const chosen = channels.filter((c) => selected.has(c.channelId));
  const args: Record<string, unknown> = {
    content: contentEl.value.trim(),
    channels: chosen.map((c) => ({ channelId: c.channelId, platform: c.platform })),
    status: isScheduling() ? "scheduled" : "draft",
  };
  if (isScheduling()) {
    args.scheduledAt = new Date(scheduledAtEl.value).toISOString();
    args.timezone = timeZone;
  }

  try {
    const result = await app.callServerTool({
      name: "create_post",
      arguments: args,
    });
    const parsed = parseToolText(result);
    const obj =
      parsed && typeof parsed === "object" ? (parsed as Record<string, any>) : null;
    const id = obj?.id ?? obj?.post?.id;

    if (!result.isError && id != null) {
      showSuccess(
        isScheduling()
          ? `Scheduled ✓ — post #${id}`
          : `Draft saved ✓ — post #${id}`,
      );
      app
        .sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text: isScheduling()
                ? `Scheduled post #${id}.`
                : `Saved draft #${id}.`,
            },
          ],
        })
        .catch(() => {});
    } else {
      const msg =
        typeof parsed === "string"
          ? parsed
          : obj?.error?.message || obj?.message || "Could not create the post.";
      showError(String(msg));
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "Request failed.");
  } finally {
    submitting = false;
    updateSubmitState();
  }
});

/* ----------------------------- connect ----------------------------- */

updateCount();
updateSubmitState();
tzLabelEl.textContent = timeZone;

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if the opening tool-result didn't carry channels, fetch them
  // directly so the picker still populates.
  window.setTimeout(async () => {
    if (loaded) return;
    try {
      const res = await app.callServerTool({
        name: "list_channels",
        arguments: { active: true },
      });
      ingestChannels(channelsFromAny(parseToolText(res)));
    } catch (e) {
      console.error("[composer] list_channels fallback failed", e);
      composerEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load channels";
    }
  }, 300);
});
