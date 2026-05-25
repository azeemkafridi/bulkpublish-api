/**
 * BulkPublish Media Library — MCP App View.
 *
 * Runs inside the host's sandboxed iframe. It displays the user's uploaded
 * media files (images, videos, and other assets) as a responsive thumbnail
 * grid. Data arrives via the `view_media` tool result (structuredContent) and
 * is refreshed whenever the host fires a new toolresult event.
 */
import "./media.css";
import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  applyHostFonts,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";

type MediaItem = {
  id?: number;
  url?: string;
  filename?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const mediaEl = document.querySelector(".media") as HTMLElement;
const subEl = $("sub");
const gridEl = $("grid");
const emptyEl = $("empty");

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

function extFromFilename(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot !== -1 ? filename.slice(dot + 1).toUpperCase() : "";
}

/* ----------------------------- rendering ----------------------------- */

function makeTile(item: MediaItem): HTMLElement {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.setAttribute("role", "listitem");

  const filename = item.filename ?? "";
  const mime = item.mimeType ?? "";
  const isImage = mime.startsWith("image/") && !!item.url;
  const isVideo = mime.startsWith("video/");

  // Thumb
  const thumb = document.createElement("div");
  thumb.className = "tile__thumb";

  if (isImage) {
    const img = document.createElement("img");
    img.className = "tile__img";
    img.src = item.url!;
    img.loading = "lazy";
    img.alt = escapeHtml(filename);
    thumb.appendChild(img);
  } else if (isVideo) {
    thumb.classList.add("tile__thumb--video");
    const play = document.createElement("span");
    play.className = "tile__play";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "▶";
    thumb.appendChild(play);
  } else {
    thumb.classList.add("tile__thumb--file");
    const glyph = document.createElement("span");
    glyph.className = "tile__glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "📄";
    thumb.appendChild(glyph);
    if (filename) {
      const ext = extFromFilename(filename);
      if (ext) {
        const extEl = document.createElement("span");
        extEl.className = "tile__ext";
        extEl.textContent = ext;
        thumb.appendChild(extEl);
      }
    }
  }

  tile.appendChild(thumb);

  // Caption
  const caption = document.createElement("div");
  caption.className = "tile__caption";

  if (filename) {
    const nameEl = document.createElement("span");
    nameEl.className = "tile__name";
    nameEl.title = escapeHtml(filename);
    nameEl.textContent = filename;
    caption.appendChild(nameEl);
  }

  if (
    typeof item.width === "number" &&
    typeof item.height === "number" &&
    Number.isFinite(item.width) &&
    Number.isFinite(item.height)
  ) {
    const dimsEl = document.createElement("span");
    dimsEl.className = "tile__dims";
    dimsEl.textContent = `${item.width}×${item.height}`;
    caption.appendChild(dimsEl);
  }

  tile.appendChild(caption);
  return tile;
}

function render(data: unknown): void {
  loaded = true;
  mediaEl.removeAttribute("aria-busy");

  const items: MediaItem[] = [];

  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    const raw = Array.isArray(data)
      ? data
      : Array.isArray(o.media)
        ? o.media
        : Array.isArray(o.items)
          ? o.items
          : Array.isArray(o.data)
            ? o.data
            : [];

    for (const entry of raw) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      items.push({
        id: e.id != null ? Number(e.id) : undefined,
        url: typeof e.url === "string" ? e.url : undefined,
        filename:
          typeof e.filename === "string"
            ? e.filename
            : typeof e.name === "string"
              ? e.name
              : undefined,
        mimeType:
          typeof e.mimeType === "string"
            ? e.mimeType
            : typeof e.mime_type === "string"
              ? e.mime_type
              : typeof e.type === "string"
                ? e.type
                : undefined,
        width:
          e.width != null && Number.isFinite(Number(e.width))
            ? Number(e.width)
            : undefined,
        height:
          e.height != null && Number.isFinite(Number(e.height))
            ? Number(e.height)
            : undefined,
      });
    }
  }

  gridEl.innerHTML = "";

  if (items.length === 0) {
    emptyEl.hidden = false;
    subEl.textContent = "No media uploaded yet";
    return;
  }

  emptyEl.hidden = true;
  subEl.textContent = `${items.length} file${items.length === 1 ? "" : "s"}`;

  for (const item of items) {
    gridEl.appendChild(makeTile(item));
  }
}

/* ----------------------------- app wiring ----------------------------- */

const app = new App({ name: "Media library", version: "1.0.0" });

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
app.onerror = (e) => console.error("[media]", e);

/* ----------------------------- connect ----------------------------- */

app.connect().then(() => {
  const ctx = app.getHostContext();
  if (ctx) applyHostContext(ctx);

  // Fallback: if the opening tool-result didn't carry media data, fetch it
  // directly so the grid still populates.
  window.setTimeout(async () => {
    if (loaded) return;
    try {
      const res = await app.callServerTool({
        name: "view_media",
        arguments: {},
      });
      render(res.structuredContent);
    } catch (e) {
      console.error("[media] view_media fallback failed", e);
      mediaEl.removeAttribute("aria-busy");
      subEl.textContent = "Couldn't load media";
    }
  }, 300);
});
