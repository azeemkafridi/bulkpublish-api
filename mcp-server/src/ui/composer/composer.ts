/**
 * BulkPublish Composer — MCP App View.
 *
 * Runs inside the host's sandboxed iframe. Receives connected channels + the
 * user's media library from the `compose_post` tool result (structuredContent),
 * lets the user pick channels, write content, attach media from their library,
 * and optionally schedule. On submit it calls the server's existing tools via
 * the host bridge: `create_post` (draft/scheduled) and, for Publish now,
 * `create_post` then `publish_post`. The iframe holds no credentials.
 */
import "./composer.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { platformIcon, platformBg } from "./platform-icons";

type Channel = { channelId: number; platform: string; accountName?: string };
type Media = {
  id: number;
  url?: string;
  filename?: string;
  mimeType?: string;
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

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const composerEl = document.querySelector(".composer") as HTMLElement;
const subEl = $("sub");
const channelsEl = $("channels");
const channelsEmptyEl = $("channels-empty");
const contentEl = $<HTMLTextAreaElement>("content");
const countEl = $("count");
const mediaField = $("media-field");
const mediaGrid = $("media-grid");
const mediaFileEl = $<HTMLInputElement>("media-file");
const scheduledAtEl = $<HTMLInputElement>("scheduled-at");
const tzLabelEl = $("tz-label");
const errorEl = $("error");
const successEl = $("success");
const draftBtn = $<HTMLButtonElement>("draft-btn");
const scheduleBtn = $<HTMLButtonElement>("schedule-btn");
const publishBtn = $<HTMLButtonElement>("publish-btn");

let channels: Channel[] = [];
let media: Media[] = [];
const selected = new Set<number>();
const selectedMedia = new Set<number>();
let timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
let loaded = false;
let submitting = false;
let uploading = false;

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

function arrFrom(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
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
    chip.style.setProperty("--icon-bg", platformBg(ch.platform));
    chip.setAttribute("aria-pressed", String(on));
    const label = PLATFORM_LABELS[ch.platform] ?? ch.platform;
    const icon = platformIcon(ch.platform);
    chip.innerHTML =
      `<span class="chip__icon">${icon || `<span class="chip__dot"></span>`}</span>` +
      `<span class="chip__label">${escapeHtml(label)}</span>` +
      (ch.accountName
        ? `<span class="chip__acct">${escapeHtml(ch.accountName)}</span>`
        : "");
    chip.addEventListener("click", () => {
      if (selected.has(ch.channelId)) selected.delete(ch.channelId);
      else selected.add(ch.channelId);
      const nowOn = selected.has(ch.channelId);
      chip.classList.toggle("chip--on", nowOn);
      chip.setAttribute("aria-pressed", String(nowOn));
      updateButtons();
    });
    channelsEl.appendChild(chip);
  }
}

// A media file whose R2 object is gone (image 404 / video load error) is a dead
// record — remove it from the grid + selection so it can't be picked or posted.
function dropDeadMedia(id: number, tile: HTMLElement): void {
  media = media.filter((x) => x.id !== id);
  const wasSelected = selectedMedia.delete(id);
  tile.remove();
  if (wasSelected) updateButtons();
}

function renderMedia(): void {
  mediaGrid.innerHTML = "";
  mediaField.hidden = false;

  // Upload tile (always first): opens the file picker, spins while uploading.
  const up = document.createElement("button");
  up.type = "button";
  up.className = "media-tile media-tile--upload";
  up.disabled = uploading;
  up.title = uploading ? "Uploading…" : "Upload image or video";
  up.innerHTML = uploading
    ? `<span class="media-tile__spin" aria-hidden="true"></span>`
    : `<span class="media-tile__upload" aria-hidden="true">+</span>`;
  up.setAttribute("aria-label", up.title);
  up.addEventListener("click", () => mediaFileEl.click());
  mediaGrid.appendChild(up);

  for (const m of media) {
    const on = selectedMedia.has(m.id);
    const tile = document.createElement("button");
    tile.type = "button";
    tile.className = on ? "media-tile media-tile--on" : "media-tile";
    tile.setAttribute("aria-pressed", String(on));
    tile.title = m.filename ?? `#${m.id}`;
    const isVideo = (m.mimeType ?? "").startsWith("video/");
    if (!isVideo && m.url) {
      const img = document.createElement("img");
      img.src = m.url;
      img.alt = m.filename ?? "";
      img.loading = "lazy";
      // A 404 means the R2 file was reclaimed/missing — a dead record we
      // shouldn't offer (broken thumbnail + would fail to publish). Drop it.
      img.addEventListener("error", () => dropDeadMedia(m.id, tile));
      tile.appendChild(img);
    } else if (isVideo && m.url) {
      tile.innerHTML = `<span class="media-tile__video">▶</span>`;
      // Video has no server thumbnail, so probe the file itself — a missing one
      // is dropped too, instead of leaving an empty ▶ tile that can't publish.
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.addEventListener("error", () => dropDeadMedia(m.id, tile));
      probe.src = m.url;
    } else if (isVideo) {
      tile.innerHTML = `<span class="media-tile__video">▶</span>`;
    } else {
      tile.innerHTML = `<span class="media-tile__file">🖼</span>`;
    }
    tile.insertAdjacentHTML(
      "beforeend",
      `<span class="media-tile__check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg></span>`,
    );
    tile.addEventListener("click", () => {
      if (selectedMedia.has(m.id)) selectedMedia.delete(m.id);
      else selectedMedia.add(m.id);
      const nowOn = selectedMedia.has(m.id);
      tile.classList.toggle("media-tile--on", nowOn);
      tile.setAttribute("aria-pressed", String(nowOn));
    });
    mediaGrid.appendChild(tile);
  }
}

/* ----------------------------- media upload ----------------------------- */
// Presigned direct-to-R2: reserve a URL (create_media_upload) → PUT the bytes
// straight to R2 from here → record it (finalize_media_upload). The new file is
// added to the library and auto-selected for this post.

async function handleFiles(files: FileList): Promise<void> {
  if (uploading || files.length === 0) return;
  uploading = true;
  clearBanners();
  renderMedia();
  let ok = 0;
  for (const file of Array.from(files)) {
    try {
      await uploadOne(file);
      ok++;
    } catch (e) {
      showError(`${file.name}: ${e instanceof Error ? e.message : "upload failed"}`);
    }
  }
  uploading = false;
  renderMedia();
  updateButtons();
  if (ok > 0) {
    showSuccess(`Uploaded ${ok} file${ok > 1 ? "s" : ""} ✓ — selected for this post.`);
  }
}

async function uploadOne(file: File): Promise<void> {
  const contentType = file.type || "application/octet-stream";
  // 1. reserve a presigned R2 URL
  const pres = parseToolText(
    await app.callServerTool({
      name: "create_media_upload",
      arguments: { contentType, sizeBytes: file.size },
    }),
  ) as Record<string, any> | string | undefined;
  const uploadUrl = typeof pres === "object" ? pres?.uploadUrl : undefined;
  const r2Key = typeof pres === "object" ? pres?.r2Key : undefined;
  if (!uploadUrl || !r2Key) {
    throw new Error(
      (typeof pres === "object" && (pres?.error?.message || pres?.error)) ||
        "couldn't start the upload",
    );
  }
  // 2. PUT the bytes straight to R2 (allowed by the widget CSP connect-src)
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: file,
  });
  if (!put.ok) throw new Error(`R2 upload failed (HTTP ${put.status})`);
  // 3. best-effort dimensions (optional — helps the saved record)
  const dims = await readDimensions(file, contentType).catch(() => ({}));
  // 4. finalize — records the media file (server HEAD/magic-byte-verifies it)
  const fin = parseToolText(
    await app.callServerTool({
      name: "finalize_media_upload",
      arguments: {
        r2Key,
        fileName: file.name,
        mimeType: contentType,
        sizeBytes: file.size,
        ...dims,
      },
    }),
  ) as Record<string, any> | string | undefined;
  const f = typeof fin === "object" ? fin?.file : undefined;
  if (!f?.id) {
    throw new Error(
      (typeof fin === "object" && (fin?.error?.message || fin?.error)) ||
        "couldn't save the upload",
    );
  }
  // 5. add to the library + auto-select + show immediately
  media = media.filter((m) => m.id !== f.id);
  media.unshift({
    id: f.id,
    url: f.previewUrl ?? f.thumbnailUrl ?? f.originalUrl ?? undefined,
    filename: f.fileName,
    mimeType: f.mimeType,
  });
  selectedMedia.add(f.id);
  renderMedia();
}

function readDimensions(
  file: File,
  contentType: string,
): Promise<{ width?: number; height?: number; duration?: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const done = (v: { width?: number; height?: number; duration?: number }) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const fail = () => {
      URL.revokeObjectURL(url);
      reject(new Error("decode"));
    };
    if (contentType.startsWith("image/")) {
      const img = new Image();
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = fail;
      img.src = url;
    } else if (contentType.startsWith("video/")) {
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () =>
        done({
          width: v.videoWidth,
          height: v.videoHeight,
          duration: Number.isFinite(v.duration) ? Math.round(v.duration) : undefined,
        });
      v.onerror = fail;
      v.src = url;
    } else {
      done({});
    }
  });
}

function updateCount(): void {
  countEl.textContent = String(contentEl.value.length);
}

function updateButtons(): void {
  const base =
    !submitting &&
    contentEl.value.trim().length > 0 &&
    selected.size > 0;
  draftBtn.disabled = !base;
  publishBtn.disabled = !base;
  scheduleBtn.disabled = !base || !scheduledAtEl.value;
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
  for (const raw of arrFrom(list, "channels", "data", "items")) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = Number(o.channelId ?? o.id);
    const platform = String(o.platform ?? "");
    if (!Number.isFinite(id) || !platform) continue;
    next.push({
      channelId: id,
      platform,
      accountName: (o.accountName ?? o.name ?? o.username) as string | undefined,
    });
  }
  channels = next;
  subEl.textContent = channels.length
    ? `${channels.length} connected channel${channels.length === 1 ? "" : "s"}`
    : "No connected channels";
  renderChannels();
  updateButtons();
}

function ingestMedia(list: unknown): void {
  const next: Media[] = [];
  for (const raw of arrFrom(list, "media", "files", "data", "items")) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isFinite(id)) continue;
    next.push({
      id,
      url: (o.url ?? o.previewUrl ?? o.thumbnailUrl ?? o.originalUrl) as
        | string
        | undefined,
      filename: (o.filename ?? o.fileName ?? o.name) as string | undefined,
      mimeType: (o.mimeType ?? o.type) as string | undefined,
    });
  }
  media = next;
  renderMedia();
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

// compose_post delivers channels + media as its structuredContent.
app.addEventListener("toolresult", (params) => {
  const sc = params.structuredContent as
    | { channels?: unknown; media?: unknown }
    | undefined;
  if (sc && "channels" in sc) ingestChannels(sc.channels);
  if (sc && "media" in sc) ingestMedia(sc.media);
});

// If the model passed `content` to compose_post, prefill the textarea.
app.addEventListener("toolinput", (params) => {
  const args = params.arguments as { content?: string } | undefined;
  if (args?.content && !contentEl.value) {
    contentEl.value = args.content;
    updateCount();
    updateButtons();
  }
});

app.addEventListener("hostcontextchanged", applyHostContext);
app.onerror = (e) => console.error("[composer]", e);

/* ----------------------------- UI events ----------------------------- */

contentEl.addEventListener("input", () => {
  updateCount();
  updateButtons();
});
scheduledAtEl.addEventListener("input", updateButtons);
mediaFileEl.addEventListener("change", () => {
  if (mediaFileEl.files && mediaFileEl.files.length) void handleFiles(mediaFileEl.files);
  mediaFileEl.value = ""; // let the same file be re-picked
});

function postIdFrom(result: CallToolResult): number | undefined {
  const parsed = parseToolText(result);
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, any>;
    const id = o.id ?? o.post?.id;
    return typeof id === "number" ? id : undefined;
  }
  return undefined;
}

async function submit(mode: "draft" | "scheduled" | "published"): Promise<void> {
  if (submitting) return;
  clearBanners();
  submitting = true;
  updateButtons();

  const chosen = channels.filter((c) => selected.has(c.channelId));
  const args: Record<string, unknown> = {
    content: contentEl.value.trim(),
    channels: chosen.map((c) => ({ channelId: c.channelId, platform: c.platform })),
    status: mode === "scheduled" ? "scheduled" : "draft",
  };
  if (selectedMedia.size) args.mediaFileIds = [...selectedMedia];
  if (mode === "scheduled") {
    args.scheduledAt = new Date(scheduledAtEl.value).toISOString();
    args.timezone = timeZone;
  }

  try {
    const res = await app.callServerTool({ name: "create_post", arguments: args });
    const id = postIdFrom(res);
    if (res.isError || id == null) {
      const parsed = parseToolText(res);
      const msg =
        typeof parsed === "string"
          ? parsed
          : (parsed as any)?.error?.message ||
            (parsed as any)?.message ||
            "Could not create the post.";
      showError(String(msg));
      return;
    }

    if (mode === "published") {
      const pub = await app.callServerTool({
        name: "publish_post",
        arguments: { postId: id },
      });
      if (pub.isError) {
        const p = parseToolText(pub);
        showError(
          `Draft #${id} saved, but publish failed: ${typeof p === "string" ? p : "see logs"}`,
        );
        return;
      }
      showSuccess(`Publishing #${id}… checking the result.`);
      await reportPublishResult(id);
    } else if (mode === "scheduled") {
      showSuccess(`Scheduled ✓ — post #${id}`);
      tellHost(`Scheduled post #${id}.`);
    } else {
      showSuccess(`Draft saved ✓ — post #${id}`);
      tellHost(`Saved draft #${id}.`);
    }
  } catch (e) {
    showError(e instanceof Error ? e.message : "Request failed.");
  } finally {
    submitting = false;
    updateButtons();
  }
}

function tellHost(text: string): void {
  app.sendMessage({ role: "user", content: [{ type: "text", text }] }).catch(() => {});
}

const delay = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

// publish_post only QUEUES the post — the worker publishes to each platform
// async. Poll get_post until it's terminal, then show the real per-platform
// outcome (success / partial / failure) instead of a misleading "queued ✓".
async function reportPublishResult(postId: number): Promise<void> {
  const label = (p: string) => PLATFORM_LABELS[p] ?? p;
  for (let i = 0; i < 12; i++) {
    await delay(i === 0 ? 1500 : 2500);
    let post: Record<string, any> | undefined;
    try {
      const r = parseToolText(
        await app.callServerTool({ name: "get_post", arguments: { postId } }),
      );
      post = r && typeof r === "object" ? (r as Record<string, any>) : undefined;
    } catch {
      continue;
    }
    if (!post) continue;
    const status = String(post.status ?? "");
    if (status !== "published" && status !== "failed" && status !== "partial") {
      continue; // still draft/publishing — keep polling
    }
    const plats = arrFrom(post.postPlatforms, "postPlatforms", "platforms") as Array<
      Record<string, any>
    >;
    const ok = plats.filter((p) => p.status === "published").map((p) => label(String(p.platform)));
    const failed = plats.filter((p) => p.status === "failed");
    if (failed.length === 0) {
      showSuccess(`Published ✓ — ${ok.length ? ok.join(", ") : `post #${postId}`}`);
      tellHost(`Published post #${postId}${ok.length ? ` to ${ok.join(", ")}` : ""}.`);
    } else {
      const fails = failed
        .map((p) => `${label(String(p.platform))}: ${p.errorMessage || "failed"}`)
        .join(" · ");
      if (ok.length) {
        showError(`Partly published — ✓ ${ok.join(", ")}. Failed → ${fails}`);
        tellHost(`Post #${postId} partly published (ok: ${ok.join(", ")}; failed → ${fails}).`);
      } else {
        showError(`Publish failed — ${fails}`);
        tellHost(`Post #${postId} failed to publish — ${fails}`);
      }
    }
    return;
  }
  // Still publishing after the polling window — don't claim success or failure.
  showSuccess(`Post #${postId} is still publishing — check your dashboard for the result.`);
  tellHost(`Post #${postId} is still publishing.`);
}

draftBtn.addEventListener("click", () => submit("draft"));
scheduleBtn.addEventListener("click", () => submit("scheduled"));
publishBtn.addEventListener("click", () => submit("published"));

/* ----------------------------- connect ----------------------------- */

updateCount();
updateButtons();
renderMedia(); // show the Upload (+) tile from the start, before media loads
tzLabelEl.textContent = timeZone;
// Scheduling is optional: the Schedule button stays disabled until a time is set.
scheduledAtEl.min = toLocalInput(new Date());

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if the opening tool-result didn't carry data, fetch it directly.
  window.setTimeout(async () => {
    if (loaded) return;
    try {
      const ch = await app.callServerTool({
        name: "list_channels",
        arguments: { active: true },
      });
      if (loaded) return; // tool-result arrived during the await — don't clobber
      ingestChannels(parseToolText(ch));
    } catch (e) {
      if (loaded) return;
      console.error("[composer] list_channels fallback failed", e);
      composerEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load channels";
      return;
    }
    try {
      const md = await app.callServerTool({
        name: "list_media",
        arguments: { limit: 12 },
      });
      ingestMedia(parseToolText(md));
    } catch {
      /* media is optional */
    }
  }, 300);
});
