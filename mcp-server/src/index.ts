#!/usr/bin/env node

/**
 * BulkPublish MCP Server
 *
 * A Model Context Protocol server that lets Claude and other AI assistants
 * interact with the BulkPublish social media publishing API.
 *
 * Environment variables:
 *   BULKPUBLISH_API_KEY  — Your BulkPublish API key (starts with bp_)
 *   BULKPUBLISH_BASE_URL — API base URL (default: https://app.bulkpublish.com)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import {
  registerAppTool,
  registerAppResource,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { WIDGET_HTML } from "./ui/widgets.generated.js";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".webp": "image/webp", ".gif": "image/gif", ".mp4": "video/mp4",
  ".mov": "video/quicktime", ".webm": "video/webm",
};
function mimeFromPath(filePath: string): string {
  const ext = filePath.toLowerCase().match(/\.[^.]+$/)?.[0] || "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_KEY = process.env.BULKPUBLISH_API_KEY;
const BASE_URL = (
  process.env.BULKPUBLISH_BASE_URL || "https://app.bulkpublish.com"
).replace(/\/+$/, "");

// API_KEY may be absent during Smithery sandbox scanning — tools will error at runtime

// Per-request API key context. In stdio mode there is no active store, so this
// falls back to the BULKPUBLISH_API_KEY env var — existing behavior, unchanged.
// The hosted HTTP server (src/http.ts) runs each request inside
// requestContext.run({ apiKey }), so every tool call uses that caller's key and
// the process never holds a shared key.
export const requestContext = new AsyncLocalStorage<{ apiKey?: string }>();
function activeApiKey(): string | undefined {
  return requestContext.getStore()?.apiKey ?? API_KEY;
}

// R2 S3 endpoint the composer PUTs presigned uploads to. Declared in the widget
// CSP (connect-src) so the host's sandbox allows the direct-to-R2 upload. Not a
// secret — it's the public account endpoint baked into every presigned URL.
const R2_UPLOAD_ORIGIN =
  process.env.R2_UPLOAD_ORIGIN ||
  "https://d46a1bf4b4491a708ec851e1aade51e5.r2.cloudflarestorage.com";

// When set, the quota tool + widget (which surface plan name and paid-tier
// limits) are dropped from registration. Used for the ChatGPT Apps submission
// where OpenAI's Commerce & Purchasing policy disallows surfacing digital
// subscriptions. Default off — Claude / Anthropic Directory keep the tools.
const HIDE_BILLING_TOOLS = process.env.BULKPUBLISH_HIDE_BILLING === "1";

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${activeApiKey()}`,
    "Content-Type": "application/json",
  };

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

function formatResponse(res: ApiResponse): string {
  if (!res.ok) {
    const err = res.data as { error?: { message?: string }; message?: string };
    const msg =
      err?.error?.message || err?.message || `HTTP ${res.status} error`;
    return `Error: ${msg}`;
  }
  return JSON.stringify(res.data, null, 2);
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

// Build a fully-registered MCP server instance. Called once for stdio (below)
// and once per request by the hosted HTTP server, so each HTTP caller gets an
// isolated server whose tool calls use their own API key via requestContext.
export function createServer(): McpServer {
  const server = new McpServer({
    name: "bulkpublish",
    version: "1.0.0",
  });

  // --- Tool annotations (MCP Connectors Directory requirement) -------------
  // Directory review requires every tool to expose a human-readable `title`
  // plus the applicable readOnly/destructive hint. Both registration paths —
  // regular tools (server.tool) and widgets (registerAppTool →
  // server.registerTool) — funnel through the SDK's internal
  // _createRegisteredTool(name, title, description, inputSchema, outputSchema,
  // annotations, …), so we inject annotations there by tool name from this one
  // map instead of threading an argument through ~37 call sites. Guarded so it
  // degrades to "no annotations" (rather than crashing) if the SDK changes.
  type ToolAnn = {
    title: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  const TOOL_ANNOTATIONS: Record<string, ToolAnn> = {
    // Read-only
    list_channels: { title: "List channels", readOnlyHint: true },
    list_posts: { title: "List posts", readOnlyHint: true },
    get_post: { title: "Get post", readOnlyHint: true },
    get_post_metrics: { title: "Get post metrics", readOnlyHint: true },
    list_media: { title: "List media", readOnlyHint: true },
    get_media: { title: "Get media file", readOnlyHint: true },
    list_labels: { title: "List labels", readOnlyHint: true },
    list_schedules: { title: "List recurring schedules", readOnlyHint: true },
    get_analytics: { title: "Get analytics", readOnlyHint: true },
    get_quota_usage: { title: "Get quota usage", readOnlyHint: true },
    get_queue_slot: { title: "Get next queue slot", readOnlyHint: true },
    get_channel_health: { title: "Get channel health", readOnlyHint: true },
    get_channel_options: { title: "Get channel post-type options", readOnlyHint: true },
    search_mentions: { title: "Search mentions", readOnlyHint: true, openWorldHint: true },
    // Create / update (non-destructive writes)
    create_post: { title: "Create post", readOnlyHint: false, destructiveHint: false },
    update_post: { title: "Update post", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    bulk_posts: { title: "Bulk-create posts", readOnlyHint: false, destructiveHint: false },
    upload_media: { title: "Upload media", readOnlyHint: false, destructiveHint: false },
    create_media_upload: { title: "Start media upload", readOnlyHint: false, destructiveHint: false },
    finalize_media_upload: { title: "Finalize media upload", readOnlyHint: false, destructiveHint: false },
    create_label: { title: "Create label", readOnlyHint: false, destructiveHint: false },
    update_label: { title: "Update label", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    create_schedule: { title: "Create recurring schedule", readOnlyHint: false, destructiveHint: false },
    update_schedule: { title: "Update recurring schedule", readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    // Publishing (writes out to external platforms)
    publish_post: { title: "Publish post now", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    retry_post: { title: "Retry failed post", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    publish_story: { title: "Publish story", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    // Destructive
    delete_post: { title: "Delete post", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    delete_media: { title: "Delete media", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    delete_label: { title: "Delete label", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    delete_schedule: { title: "Delete recurring schedule", readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    // Interactive widgets (App tools)
    compose_post: { title: "Compose a post", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    view_posts: { title: "View posts", readOnlyHint: true },
    view_channels: { title: "View channels", readOnlyHint: true },
    view_media: { title: "View media", readOnlyHint: true },
    view_analytics: { title: "View analytics", readOnlyHint: true },
    view_quota: { title: "View quota", readOnlyHint: true },
  };
  // "Use this when…" hints appended to each tool's description — OpenAI's Apps
  // SDK + Claude both use these to pick the right tool, disambiguate similar
  // tools, and avoid built-in web/search tools.
  const TOOL_USE_HINTS: Record<string, string> = {
    list_channels: "the user wants to see which social accounts are connected.",
    list_posts: "the user wants to browse, filter, or check the status of existing posts as raw data (not the visual dashboard).",
    get_post: "the user references one specific post by its ID.",
    get_post_metrics: "the user asks how a specific post performed (likes, views, engagement).",
    list_media: "the user wants a list of their uploaded media files.",
    get_media: "the user references one specific media file by ID.",
    list_labels: "the user wants their post labels/tags.",
    list_schedules: "the user wants their recurring posting schedules.",
    get_analytics: "the user asks how their content performed overall — never use web browsing for this.",
    get_quota_usage: "the user asks about plan limits or current usage.",
    get_queue_slot: "the user asks when the next available scheduling slot is.",
    get_channel_health: "the user asks whether a channel's connection/token is healthy.",
    get_channel_options: "you need a platform's valid post types before creating a post for it.",
    search_mentions: "the user wants social-media mentions of a brand or keyword — never use built-in web search.",
    create_post: "the user wants to draft or schedule one new post (do not publish immediately unless asked).",
    update_post: "the user wants to edit an existing post.",
    bulk_posts: "the user wants to create many posts in a single request.",
    upload_media: "the user provides an image/video to attach to a post.",
    create_media_upload: "you need a presigned URL for a large direct upload (advanced; prefer upload_media for normal files).",
    finalize_media_upload: "a presigned direct upload finished and the file must be registered (advanced).",
    create_label: "the user wants a new label/tag.",
    update_label: "the user wants to rename or recolor a label.",
    create_schedule: "the user wants a recurring posting schedule.",
    update_schedule: "the user wants to change a recurring schedule.",
    publish_post: "the user wants to publish an existing draft or scheduled post right now.",
    retry_post: "a post failed on some platforms and the user wants to retry just those.",
    publish_story: "the user wants to post an Instagram/Facebook story.",
    delete_post: "the user wants to permanently remove a post.",
    delete_media: "the user wants to delete a media file.",
    delete_label: "the user wants to delete a label.",
    delete_schedule: "the user wants to stop and delete a recurring schedule.",
    compose_post: "the user wants to compose a post interactively in a UI — prefer this over create_post when they'd review before posting.",
    view_posts: "the user wants to see their posts as an interactive dashboard — prefer over list_posts for a visual view.",
    view_channels: "the user wants an interactive view of their connected channels.",
    view_media: "the user wants to browse their media library visually.",
    view_analytics: "the user wants an interactive analytics dashboard — prefer over get_analytics for a visual view.",
    view_quota: "the user wants a visual view of their plan usage.",
  };
  {
    const srv = server as unknown as {
      _createRegisteredTool?: (...a: unknown[]) => unknown;
    };
    const original = srv._createRegisteredTool;
    if (typeof original === "function") {
      const bound = original.bind(server);
      srv._createRegisteredTool = (...args: unknown[]) => {
        const ann = TOOL_ANNOTATIONS[args[0] as string];
        if (ann) {
          if (!args[1]) args[1] = ann.title; // tool title (regular tools have none)
          // OpenAI Apps SDK requires every tool to set ALL THREE hints
          // explicitly. Default them to false; the map's accurate values (and
          // any explicitly-passed annotations) override.
          args[5] = {
            readOnlyHint: false,
            destructiveHint: false,
            openWorldHint: false,
            ...ann,
            ...((args[5] as object) ?? {}),
          }; // annotations slot
        }
        const use = TOOL_USE_HINTS[args[0] as string];
        if (use && typeof args[2] === "string" && !(args[2] as string).includes("Use this when")) {
          args[2] = (args[2] as string).replace(/\s+$/, "") + " Use this when " + use; // description slot
        }
        return bound(...args);
      };
    }
  }

// ---------------------------------------------------------------------------
// Tool: list_channels
// ---------------------------------------------------------------------------

server.tool(
  "list_channels",
  "List all connected social media channels (X/Twitter, Instagram, LinkedIn, Facebook, TikTok, etc.). Returns channel ID, platform, account name, and token status.",
  {
    active: z
      .boolean()
      .optional()
      .describe(
        "Filter by active status. Defaults to true (only active channels)."
      ),
  },
  async ({ active }) => {
    const params = new URLSearchParams();
    if (active !== undefined) params.set("active", String(active));
    const qs = params.toString();
    const res = await api("GET", `/api/channels${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Platform validation helpers
// ---------------------------------------------------------------------------

const VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/avi",
  "video/x-msvideo",
  "video/x-ms-wmv",
  "video/x-flv",
]);
const IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

interface MediaInfo {
  id: number;
  mimeType: string;
}

async function getMediaInfoForIds(
  ids: number[]
): Promise<{ medias: MediaInfo[]; error?: string }> {
  if (ids.length === 0) return { medias: [] };
  const results: MediaInfo[] = [];
  for (const id of ids) {
    const res = await api<{ id: number; mimeType: string }>(
      "GET",
      `/api/media/${id}`
    );
    if (!res.ok) return { medias: [], error: `Media ID ${id} not found` };
    const d = res.data as { id: number; mimeType: string };
    results.push({ id: d.id, mimeType: d.mimeType });
  }
  return { medias: results };
}

function validatePlatformRequirements(
  channels: Array<{ channelId: number; platform: string }>,
  medias: MediaInfo[],
  postTypeOverrides?: Record<string, string>
): string[] {
  const errors: string[] = [];
  const hasVideo = medias.some((m) => VIDEO_MIMES.has(m.mimeType));
  const hasImage = medias.some((m) => IMAGE_MIMES.has(m.mimeType));
  const hasMedia = medias.length > 0;

  for (const ch of channels) {
    const postType = postTypeOverrides?.[ch.platform];

    switch (ch.platform) {
      case "youtube":
        if (!hasVideo) {
          errors.push(
            `YouTube requires a video file. Either remove YouTube from channels or attach a video.`
          );
        }
        break;
      case "tiktok":
        if (!hasVideo) {
          errors.push(
            `TikTok requires a video file (or images for photo_slideshow). Either remove TikTok or attach a video.`
          );
        }
        break;
      case "instagram":
        if (postType === "reel" && !hasVideo)
          errors.push(`Instagram reel requires a video file.`);
        if (postType === "feed_video" && !hasVideo)
          errors.push(`Instagram feed_video requires a video file.`);
        if (postType === "carousel" && medias.length < 2)
          errors.push(`Instagram carousel requires at least 2 media files.`);
        if (!postType && hasMedia && !hasImage && hasVideo)
          errors.push(
            `Instagram defaults to feed_photo which requires an image. Set postTypeOverrides.instagram to "reel" or "feed_video" for video content.`
          );
        break;
      case "pinterest":
        if (postType === "carousel" && medias.length < 2)
          errors.push(`Pinterest carousel requires 2-5 images.`);
        break;
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Tool: create_post
// ---------------------------------------------------------------------------

server.tool(
  "create_post",
  "Create a new social media post. Can be saved as a draft or scheduled for a specific time. Supports platform-specific content overrides, media attachments, labels, and thread format. " +
    "IMPORTANT: YouTube and TikTok REQUIRE video — do not include them when posting images only. " +
    "Instagram defaults to feed_photo — set postTypeOverrides for video content (reel, feed_video).",
  {
    content: z.string().describe("The post text content."),
    channels: z
      .array(
        z.object({
          channelId: z.number().describe("Channel ID to post to."),
          platform: z
            .string()
            .describe(
              'Platform name: "x", "instagram", "linkedin", "facebook", "tiktok", "youtube", "pinterest", "threads", "bluesky", "google_business".'
            ),
        })
      )
      .describe(
        "Array of channels to post to. Get channel IDs from list_channels."
      ),
    status: z
      .enum(["draft", "scheduled"])
      .optional()
      .describe('Post status. "draft" (default) or "scheduled".'),
    scheduledAt: z
      .string()
      .optional()
      .describe(
        "ISO 8601 datetime for scheduling (e.g. 2025-01-15T10:00:00Z). Required when status is scheduled."
      ),
    timezone: z
      .string()
      .optional()
      .describe('Timezone for scheduling (e.g. "America/New_York"). Defaults to UTC.'),
    mediaFileIds: z
      .array(z.number())
      .optional()
      .describe(
        "Array of media file IDs to attach. Upload media first with upload_media."
      ),
    labels: z
      .array(z.number())
      .optional()
      .describe("Array of label IDs to tag the post with."),
    platformSpecific: z
      .record(z.string(), z.unknown())
      .optional()
      .describe(
        'Platform-specific settings, e.g. { "instagram": { "postType": "reel" } }.'
      ),
    platformContent: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Per-platform content overrides, e.g. { "x": "Short tweet", "linkedin": "Longer LinkedIn post" }.'
      ),
    postFormat: z
      .enum(["post", "thread"])
      .optional()
      .describe('"post" (default) or "thread" for multi-part threads.'),
    threadParts: z
      .array(
        z.object({
          content: z.string().describe("Thread part content."),
          mediaFileIds: z
            .array(z.number())
            .optional()
            .describe("Media files for this thread part."),
        })
      )
      .optional()
      .describe(
        "Thread parts array. Required when postFormat is thread (min 2 parts)."
      ),
    postTypeOverrides: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Per-platform post type override. E.g. { "instagram": "reel", "facebook": "story", "youtube": "short" }. ' +
        'Instagram: feed_photo, feed_video, reel, story, carousel. Facebook: post, reel, story. ' +
        'TikTok: video, photo_slideshow. YouTube: video, short. LinkedIn: post, multi_image. ' +
        'Pinterest: pin, video_pin, carousel. GMB: standard, event, offer.'
      ),
  },
  async ({
    content,
    channels,
    status,
    scheduledAt,
    timezone,
    mediaFileIds,
    labels,
    platformSpecific,
    platformContent,
    postFormat,
    threadParts,
    postTypeOverrides,
  }) => {
    // Validate platform requirements before creating
    if (mediaFileIds && mediaFileIds.length > 0) {
      const { medias, error: mediaError } = await getMediaInfoForIds(
        mediaFileIds
      );
      if (mediaError) {
        return {
          content: [{ type: "text" as const, text: `Error: ${mediaError}` }],
        };
      }
      const validationErrors = validatePlatformRequirements(
        channels,
        medias,
        postTypeOverrides
      );
      if (validationErrors.length > 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Validation errors:\n${validationErrors.map((e) => `- ${e}`).join("\n")}`,
            },
          ],
        };
      }
    } else {
      // No media — check if any platform requires it
      const videoOnlyPlatforms = channels.filter(
        (ch) => ch.platform === "youtube" || ch.platform === "tiktok"
      );
      if (videoOnlyPlatforms.length > 0) {
        const names = videoOnlyPlatforms.map((ch) => ch.platform).join(", ");
        return {
          content: [
            {
              type: "text" as const,
              text: `Validation error: ${names} requires a video file. Either remove these platforms or attach a video via mediaFileIds.`,
            },
          ],
        };
      }
    }

    const body: Record<string, unknown> = {
      content,
      channels,
      status: status || "draft",
    };

    if (scheduledAt) body.scheduledAt = scheduledAt;
    if (timezone) body.timezone = timezone;
    if (mediaFileIds) body.mediaFiles = mediaFileIds;
    if (labels) body.labels = labels;
    if (platformSpecific) body.platformSpecific = platformSpecific;
    if (platformContent) body.platformContent = platformContent;
    if (postFormat) body.postFormat = postFormat;
    if (threadParts) body.threadParts = threadParts;
    if (postTypeOverrides) body.postTypeOverrides = postTypeOverrides;

    const res = await api("POST", "/api/posts", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_posts
// ---------------------------------------------------------------------------

server.tool(
  "list_posts",
  "List posts with optional filters for status, search text, date range, channel, and label. Returns paginated results with platform statuses and metrics.",
  {
    status: z
      .enum(["draft", "scheduled", "publishing", "published", "failed", "partial"])
      .optional()
      .describe("Filter by post status."),
    search: z.string().optional().describe("Search post content (case-insensitive)."),
    page: z.number().optional().describe("Page number (default 1)."),
    limit: z.number().optional().describe("Results per page (default 20, max 500)."),
    channelId: z.number().optional().describe("Filter by channel ID."),
    labelId: z.number().optional().describe("Filter by label ID."),
    from: z.string().optional().describe("Filter posts created on or after this ISO date."),
    to: z.string().optional().describe("Filter posts created on or before this ISO date."),
    scheduledFrom: z
      .string()
      .optional()
      .describe("Filter posts scheduled on or after this ISO date."),
    scheduledTo: z
      .string()
      .optional()
      .describe("Filter posts scheduled on or before this ISO date."),
  },
  async ({
    status,
    search,
    page,
    limit,
    channelId,
    labelId,
    from,
    to,
    scheduledFrom,
    scheduledTo,
  }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    if (channelId) params.set("channelId", String(channelId));
    if (labelId) params.set("labelId", String(labelId));
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (scheduledFrom) params.set("scheduledFrom", scheduledFrom);
    if (scheduledTo) params.set("scheduledTo", scheduledTo);

    const qs = params.toString();
    const res = await api("GET", `/api/posts${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_post
// ---------------------------------------------------------------------------

server.tool(
  "get_post",
  "Get a single post by ID with full details including platform statuses, labels, media files, recurring schedule info, and metrics.",
  {
    postId: z.number().describe("The post ID."),
  },
  async ({ postId }) => {
    const res = await api("GET", `/api/posts/${postId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: publish_post
// ---------------------------------------------------------------------------

server.tool(
  "publish_post",
  "Publish a draft or scheduled post immediately. The post will be queued for publishing to all its target channels.",
  {
    postId: z.number().describe("The post ID to publish."),
  },
  async ({ postId }) => {
    const res = await api("POST", `/api/posts/${postId}/publish`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: retry_post
// ---------------------------------------------------------------------------

server.tool(
  "retry_post",
  "Retry publishing a failed or partially failed post. Only retries the platforms that failed, not the ones that already succeeded.",
  {
    postId: z.number().describe("The post ID to retry."),
  },
  async ({ postId }) => {
    const res = await api("POST", `/api/posts/${postId}/retry`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: upload_media
// ---------------------------------------------------------------------------

server.tool(
  "upload_media",
  "Upload a media file (image or video) from a URL or local file path. The file is stored in BulkPublish for use in posts. Supported formats: JPEG, PNG, WebP, GIF, MP4, MOV, WebM. Max 100MB. Provide either url OR filePath, not both.",
  {
    url: z
      .string()
      .optional()
      .describe("Public URL of the media file to upload."),
    filePath: z
      .string()
      .optional()
      .describe(
        "Absolute path to a local file to upload (e.g. /Users/me/photo.png)."
      ),
    filename: z
      .string()
      .optional()
      .describe(
        "Optional filename. If omitted, derived from the URL or file path."
      ),
  },
  async ({ url: mediaUrl, filePath, filename }) => {
    if (!mediaUrl && !filePath) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Provide either url or filePath.",
          },
        ],
      };
    }

    let blob: Blob;
    let contentType: string;
    let derivedFilename: string;

    if (filePath) {
      // --- Local file upload ---
      const absPath = resolve(filePath);
      if (!existsSync(absPath)) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: File not found — ${absPath}`,
            },
          ],
        };
      }
      const buffer = readFileSync(absPath);
      contentType = mimeFromPath(absPath);
      blob = new Blob([buffer], { type: contentType });
      derivedFilename = filename || basename(absPath);
    } else {
      // --- URL upload (existing behavior) ---
      let fileResponse: Response;
      try {
        fileResponse = await fetch(mediaUrl!);
        if (!fileResponse.ok) {
          return {
            content: [
              {
                type: "text" as const,
                text: `Error: Failed to download file from URL (HTTP ${fileResponse.status})`,
              },
            ],
          };
        }
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: Failed to fetch URL — ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
      contentType =
        fileResponse.headers.get("content-type") || "application/octet-stream";
      blob = await fileResponse.blob();
      derivedFilename =
        filename ||
        mediaUrl!.split("/").pop()?.split("?")[0] ||
        "upload";
    }

    // Build multipart form data
    const formData = new FormData();
    formData.append(
      "file",
      new File([blob], derivedFilename, { type: contentType })
    );

    const uploadUrl = `${BASE_URL}/api/media`;
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${activeApiKey()}`,
      },
      body: formData,
    });

    const data = await uploadRes.json().catch(() => ({}));
    const result: ApiResponse = {
      ok: uploadRes.ok,
      status: uploadRes.status,
      data,
    };

    return {
      content: [{ type: "text" as const, text: formatResponse(result) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_media
// ---------------------------------------------------------------------------

server.tool(
  "list_media",
  "List uploaded media files with optional search and pagination. Returns file metadata including URLs, dimensions, and labels.",
  {
    search: z.string().optional().describe("Search by filename."),
    page: z.number().optional().describe("Page number (default 1)."),
    limit: z.number().optional().describe("Results per page (default 20, max 100)."),
  },
  async ({ search, page, limit }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));

    const qs = params.toString();
    const res = await api("GET", `/api/media${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_analytics
// ---------------------------------------------------------------------------

server.tool(
  "get_analytics",
  "Get an analytics summary for a date range. Returns total posts, status breakdown (published, failed, scheduled), per-platform stats, and daily post counts.",
  {
    from: z.string().describe("Start date in ISO format (e.g. 2025-01-01)."),
    to: z.string().describe("End date in ISO format (e.g. 2025-01-31)."),
  },
  async ({ from, to }) => {
    const params = new URLSearchParams({ from, to });
    const res = await api("GET", `/api/analytics/summary?${params}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_labels
// ---------------------------------------------------------------------------

server.tool(
  "list_labels",
  "List all labels available for tagging posts and media.",
  {
    type: z
      .enum(["post", "media"])
      .optional()
      .describe('Filter by label type: "post" or "media". Returns all if omitted.'),
  },
  async ({ type }) => {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    const qs = params.toString();
    const res = await api("GET", `/api/labels${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: create_label
// ---------------------------------------------------------------------------

server.tool(
  "create_label",
  "Create a new label for organizing posts or media files.",
  {
    name: z.string().describe("Label name."),
    color: z
      .string()
      .optional()
      .describe('Hex color code (e.g. "#6366f1"). Defaults to indigo.'),
    type: z
      .enum(["post", "media"])
      .optional()
      .describe('Label type: "post" (default) or "media".'),
  },
  async ({ name, color, type }) => {
    const body: Record<string, unknown> = { name };
    if (color) body.color = color;
    if (type) body.type = type;
    const res = await api("POST", "/api/labels", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_quota_usage — gated behind HIDE_BILLING_TOOLS so it doesn't appear
// in tools/list when the server is run for the ChatGPT submission, which is
// subject to OpenAI's no-digital-subscriptions policy.
// ---------------------------------------------------------------------------

if (!HIDE_BILLING_TOOLS) {
  server.tool(
    "get_quota_usage",
    "Check current account usage. Returns daily/monthly post counts, scheduled post counts, channel counts, and media storage usage.",
    {},
    async () => {
      const res = await api("GET", "/api/quotas/usage");
      return { content: [{ type: "text" as const, text: formatResponse(res) }] };
    }
  );
}

// ---------------------------------------------------------------------------
// Tool: update_post
// ---------------------------------------------------------------------------

server.tool(
  "update_post",
  "Update an existing post. Can change content, status, schedule, media, labels, and platform-specific settings.",
  {
    postId: z.number().describe("The post ID to update."),
    content: z.string().optional().describe("New post text content."),
    status: z.string().optional().describe('New status (e.g. "draft", "scheduled").'),
    scheduledAt: z
      .string()
      .optional()
      .describe("New ISO 8601 scheduled datetime."),
    timezone: z.string().optional().describe("Timezone for scheduling."),
    mediaFileIds: z
      .array(z.number())
      .optional()
      .describe("Replace attached media file IDs."),
    labelIds: z
      .array(z.number())
      .optional()
      .describe("Replace label IDs on the post."),
    postTypeOverrides: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Per-platform post type overrides."),
    platformSpecific: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Platform-specific settings."),
  },
  async ({
    postId,
    content,
    status,
    scheduledAt,
    timezone,
    mediaFileIds,
    labelIds,
    postTypeOverrides,
    platformSpecific,
  }) => {
    const body: Record<string, unknown> = {};
    if (content !== undefined) body.content = content;
    if (status !== undefined) body.status = status;
    if (scheduledAt !== undefined) body.scheduledAt = scheduledAt;
    if (timezone !== undefined) body.timezone = timezone;
    if (mediaFileIds !== undefined) body.mediaFiles = mediaFileIds;
    if (labelIds !== undefined) body.labels = labelIds;
    if (postTypeOverrides !== undefined) body.postTypeOverrides = postTypeOverrides;
    if (platformSpecific !== undefined) body.platformSpecific = platformSpecific;

    const res = await api("PUT", `/api/posts/${postId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_post
// ---------------------------------------------------------------------------

server.tool(
  "delete_post",
  "Delete a post by ID. Only draft and failed posts can be deleted.",
  {
    postId: z.number().describe("The post ID to delete."),
  },
  async ({ postId }) => {
    const res = await api("DELETE", `/api/posts/${postId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_post_metrics
// ---------------------------------------------------------------------------

server.tool(
  "get_post_metrics",
  "Get engagement metrics for a published post. Returns likes, comments, shares, impressions, and other platform-specific metrics.",
  {
    postId: z.number().describe("The post ID to get metrics for."),
  },
  async ({ postId }) => {
    const res = await api("GET", `/api/posts/${postId}/metrics`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: publish_story
// ---------------------------------------------------------------------------

server.tool(
  "publish_story",
  "Publish a post as a story on Facebook or Instagram.",
  {
    postId: z.number().describe("The post ID to publish as a story."),
    platform: z
      .enum(["facebook", "instagram"])
      .describe("Platform to publish the story on."),
  },
  async ({ postId, platform }) => {
    const res = await api("POST", `/api/posts/${postId}/story`, { platform });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: bulk_posts
// ---------------------------------------------------------------------------

server.tool(
  "bulk_posts",
  "Perform a bulk action on multiple posts. Supports deleting or retrying multiple posts at once.",
  {
    action: z
      .enum(["delete", "retry"])
      .describe('Bulk action: "delete" or "retry".'),
    postIds: z
      .array(z.number())
      .describe("Array of post IDs to perform the action on."),
  },
  async ({ action, postIds }) => {
    const res = await api("POST", "/api/posts/bulk", { action, postIds });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_queue_slot
// ---------------------------------------------------------------------------

server.tool(
  "get_queue_slot",
  "Get the next available queue slot for a channel. Useful for finding optimal scheduling times based on the channel's posting schedule.",
  {
    channelId: z.number().describe("The channel ID to get the queue slot for."),
    date: z
      .string()
      .optional()
      .describe("ISO date to check for slots (defaults to today)."),
  },
  async ({ channelId, date }) => {
    const params = new URLSearchParams({ channelId: String(channelId) });
    if (date) params.set("date", date);
    const res = await api("GET", `/api/posts/queue-slot?${params}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_channel_health
// ---------------------------------------------------------------------------

server.tool(
  "get_channel_health",
  "Check the health status of a connected channel. Returns token validity, connection status, and any issues.",
  {
    channelId: z.number().describe("The channel ID to check health for."),
  },
  async ({ channelId }) => {
    const res = await api("GET", `/api/channels/${channelId}/health`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_channel_options
// ---------------------------------------------------------------------------

server.tool(
  "get_channel_options",
  "Get platform-specific options for a channel (e.g. available post types, character limits, media requirements).",
  {
    channelId: z.number().describe("The channel ID to get options for."),
  },
  async ({ channelId }) => {
    const res = await api("GET", `/api/channels/${channelId}/options`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: search_mentions
// ---------------------------------------------------------------------------

server.tool(
  "search_mentions",
  "Search for @mention suggestions on a channel. Useful for finding users/pages to mention in posts.",
  {
    channelId: z.number().describe("The channel ID to search mentions on."),
    query: z.string().describe("Search query for the mention lookup."),
  },
  async ({ channelId, query }) => {
    const params = new URLSearchParams({ q: query });
    const res = await api(
      "GET",
      `/api/channels/${channelId}/mentions?${params}`
    );
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_media
// ---------------------------------------------------------------------------

server.tool(
  "get_media",
  "Get details of a single media file by ID. Returns metadata, URL, dimensions, and labels.",
  {
    mediaId: z.number().describe("The media file ID."),
  },
  async ({ mediaId }) => {
    const res = await api("GET", `/api/media/${mediaId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_media
// ---------------------------------------------------------------------------

server.tool(
  "delete_media",
  "Delete a media file by ID. Removes the file from storage and detaches it from any posts.",
  {
    mediaId: z.number().describe("The media file ID to delete."),
  },
  async ({ mediaId }) => {
    const res = await api("DELETE", `/api/media/${mediaId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_label
// ---------------------------------------------------------------------------

server.tool(
  "update_label",
  "Update an existing label's name or color.",
  {
    labelId: z.number().describe("The label ID to update."),
    name: z.string().optional().describe("New label name."),
    color: z.string().optional().describe('New hex color code (e.g. "#ef4444").'),
  },
  async ({ labelId, name, color }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (color !== undefined) body.color = color;
    const res = await api("PUT", `/api/labels/${labelId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_label
// ---------------------------------------------------------------------------

server.tool(
  "delete_label",
  "Delete a label by ID. Removes the label from all associated posts or media.",
  {
    labelId: z.number().describe("The label ID to delete."),
  },
  async ({ labelId }) => {
    const res = await api("DELETE", `/api/labels/${labelId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_schedules
// ---------------------------------------------------------------------------

server.tool(
  "list_schedules",
  "List all recurring post schedules. Returns schedule name, cron expression, target channels, and active status.",
  {},
  async () => {
    const res = await api("GET", "/api/schedules");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: create_schedule
// ---------------------------------------------------------------------------

server.tool(
  "create_schedule",
  "Create a new recurring post schedule. Posts will be automatically created and published based on the cron expression.",
  {
    name: z.string().describe("Schedule name."),
    channelIds: z
      .array(z.number())
      .describe("Array of channel IDs to post to."),
    content: z.string().describe("Post content template."),
    cronExpression: z
      .string()
      .describe('Cron expression for the schedule (e.g. "0 9 * * 1-5" for weekdays at 9am).'),
    timezone: z
      .string()
      .optional()
      .describe('Timezone for the cron schedule (e.g. "America/New_York"). Defaults to UTC.'),
  },
  async ({ name, channelIds, content, cronExpression, timezone }) => {
    const body: Record<string, unknown> = {
      name,
      channelIds,
      content,
      cronExpression,
    };
    if (timezone) body.timezone = timezone;
    const res = await api("POST", "/api/schedules", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_schedule
// ---------------------------------------------------------------------------

server.tool(
  "update_schedule",
  "Update an existing recurring schedule. Can change name, content, cron expression, timezone, or active status.",
  {
    scheduleId: z.number().describe("The schedule ID to update."),
    name: z.string().optional().describe("New schedule name."),
    content: z.string().optional().describe("New post content template."),
    cronExpression: z
      .string()
      .optional()
      .describe("New cron expression."),
    timezone: z.string().optional().describe("New timezone."),
    isActive: z
      .boolean()
      .optional()
      .describe("Enable or disable the schedule."),
  },
  async ({ scheduleId, name, content, cronExpression, timezone, isActive }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (content !== undefined) body.content = content;
    if (cronExpression !== undefined) body.cronExpression = cronExpression;
    if (timezone !== undefined) body.timezone = timezone;
    if (isActive !== undefined) body.isActive = isActive;
    const res = await api("PUT", `/api/schedules/${scheduleId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_schedule
// ---------------------------------------------------------------------------

server.tool(
  "delete_schedule",
  "Delete a recurring schedule by ID. Stops all future posts from this schedule.",
  {
    scheduleId: z.number().describe("The schedule ID to delete."),
  },
  async ({ scheduleId }) => {
    const res = await api("DELETE", `/api/schedules/${scheduleId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// MCP Apps: interactive widgets
//
// Each widget is a self-contained View bundled under src/ui/<widget>/ (see
// vite.config.ts) and inlined into WIDGET_HTML. registerWidget wires up the
// pair: an app-tool that fetches data and returns it as structuredContent, plus
// the ui://bulkpublish/<widget> resource that serves the View. The View calls
// existing tools (e.g. create_post) back through the host bridge, so the
// sandboxed iframe never holds credentials. Hosts without MCP Apps support just
// receive the text summary, so nothing breaks.
// ---------------------------------------------------------------------------

function registerWidget(config: {
  tool: string;
  widget: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  outputSchema?: Record<string, z.ZodTypeAny>;
  load: (
    args: Record<string, any>
  ) => Promise<{ text: string; data: Record<string, unknown> }>;
}): void {
  const uri = `ui://bulkpublish/${config.widget}`;
  // Widgets render in a sandboxed iframe with no same-origin server, and the
  // host blocks any origin we don't declare. The composer + view_media show
  // media thumbnails served from R2's public CDN (images.bulkpublish.com) and
  // any legacy app-served media, so allow those as static-resource origins
  // (maps to CSP img-src). All JS/CSS is inlined, so nothing else is external.
  // CSP for the sandbox iframe — read by both Claude (under _meta.ui.csp) and
  // ChatGPT (under _meta["openai/widgetCSP"]). Image thumbnails come from R2's
  // public CDN; the composer PUTs presigned uploads directly to R2.
  const csp = {
    resourceDomains: [
      "https://images.bulkpublish.com",
      "https://app.bulkpublish.com",
    ],
    connectDomains: [R2_UPLOAD_ORIGIN],
  };
  // _meta.ui.domain is Claude's slot — it must be a "<hash>.claudemcpcontent.com"
  // subdomain that Claude assigns, so we MUST NOT set it ourselves (the validator
  // rejects any other value, including a bare app hostname). ChatGPT's app domain
  // lives under the OpenAI-namespaced key "openai/widgetDomain" — Claude ignores
  // namespaced keys, ChatGPT ignores plain `ui.*`, so the two clients don't
  // collide.
  const meta = {
    ui: { csp },
    "openai/widgetDomain": "bulkpublish.com",
    "openai/widgetCSP": csp,
  };
  registerAppResource(
    server,
    config.title,
    uri,
    { mimeType: RESOURCE_MIME_TYPE, _meta: meta },
    async () => ({
      contents: [
        {
          uri,
          mimeType: RESOURCE_MIME_TYPE,
          text: WIDGET_HTML[config.widget] ?? "",
          _meta: meta,
        },
      ],
    })
  );
  registerAppTool(
    server,
    config.tool,
    {
      title: config.title,
      description: config.description,
      inputSchema: config.inputSchema,
      outputSchema: config.outputSchema,
      _meta: { ui: { resourceUri: uri } },
    },
    async (args) => {
      const { text, data } = await config.load(args as Record<string, any>);
      return {
        content: [{ type: "text" as const, text }],
        structuredContent: data,
      };
    }
  );
}

// Defensive shape helpers — the BulkPublish API responses vary, so widgets read
// loosely and we refine the contracts after a live test.
function asArray(data: unknown, ...keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    for (const k of keys) {
      const v = (data as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}
function asObject(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : { value: data };
}

// Lenient field builders for widget output schemas (the structuredContent shape).
// Everything is optional + nullable, numeric fields accept string-encoded values,
// and item objects pass through extras — so the schema documents the shape for
// the host (ChatGPT/Claude) without ever rejecting real, varied API output.
const oStr = () => z.string().nullish();
const oNum = () => z.union([z.number(), z.string()]).nullish();
const oItem = (shape: Record<string, z.ZodTypeAny>) =>
  z.object(shape).passthrough();

// --- compose_post → composer ---
registerWidget({
  tool: "compose_post",
  widget: "composer",
  title: "Compose a post",
  description:
    "Open an interactive composer to draft or schedule a social media post. " +
    "Shows the user's connected channels to pick from and pre-fills any provided text. " +
    "The user finishes in the UI; on submit it creates the post via create_post.",
  inputSchema: {
    content: z
      .string()
      .optional()
      .describe("Optional initial text to pre-fill the composer with."),
  },
  outputSchema: {
    channels: z
      .array(oItem({ channelId: oNum(), platform: oStr(), accountName: oStr() }))
      .nullish(),
    media: z
      .array(oItem({ id: oNum(), url: oStr(), filename: oStr(), mimeType: oStr() }))
      .nullish(),
  },
  load: async ({ content }) => {
    const [chRes, mdRes] = await Promise.all([
      api("GET", "/api/channels?active=true"),
      api("GET", "/api/media?limit=12"),
    ]);
    const channels = asArray(chRes.data, "channels", "data").map((c) => {
      const o = c as Record<string, unknown>;
      return {
        channelId: o.channelId ?? o.id,
        platform: o.platform,
        accountName: o.accountName ?? o.name ?? o.username,
      };
    });
    const media = asArray(mdRes.data, "files", "media", "data", "items").map(
      (m) => {
        const o = m as Record<string, any>;
        return {
          id: o.id,
          url: o.previewUrl ?? o.thumbnailUrl ?? o.originalUrl ?? o.url,
          filename: o.fileName ?? o.filename ?? o.name,
          mimeType: o.mimeType ?? o.type,
        };
      },
    );
    return {
      text: chRes.ok
        ? `Opening the composer${content ? " with your draft" : ""} — ${channels.length} channel(s), ${media.length} media file(s) available.`
        : formatResponse(chRes),
      data: { channels, media },
    };
  },
});

// --- view_analytics → analytics ---
registerWidget({
  tool: "view_analytics",
  widget: "analytics",
  title: "Analytics dashboard",
  description:
    "Open an interactive analytics dashboard for a date range — totals, status " +
    "breakdown, per-platform stats, and daily post counts.",
  inputSchema: {
    from: z
      .string()
      .optional()
      .describe("Start date (ISO, e.g. 2025-01-01). Defaults to 30 days ago."),
    to: z.string().optional().describe("End date (ISO). Defaults to today."),
  },
  outputSchema: {
    from: oStr(),
    to: oStr(),
    summary: oItem({
      totalPosts: oNum(),
      published: oNum(),
      scheduled: oNum(),
      failed: oNum(),
      partial: oNum(),
      byPlatform: z
        .array(oItem({ platform: oStr(), count: oNum(), published: oNum(), failed: oNum() }))
        .nullish(),
      daily: z.array(z.unknown()).nullish(),
    }).nullish(),
  },
  load: async ({ from, to }) => {
    const end = to || new Date().toISOString().slice(0, 10);
    const start =
      from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const res = await api(
      "GET",
      `/api/analytics/summary?from=${start}&to=${end}`
    );
    // Normalize: API returns byPlatform as an object map and daily counts as
    // `byDay`; the View expects a byPlatform array and a `daily` array.
    const s = asObject(res.data);
    const bp = s.byPlatform;
    const byPlatform =
      bp && typeof bp === "object" && !Array.isArray(bp)
        ? Object.entries(bp as Record<string, any>).map(([platform, v]) => ({
            platform,
            count: v?.total ?? v?.count ?? 0,
            published: v?.published ?? 0,
            failed: v?.failed ?? 0,
          }))
        : asArray(bp);
    const daily = asArray(s.byDay).length ? asArray(s.byDay) : asArray(s.daily);
    return {
      text: res.ok ? `Analytics for ${start} → ${end}.` : formatResponse(res),
      data: {
        from: start,
        to: end,
        summary: {
          totalPosts: s.totalPosts ?? s.total,
          published: s.published,
          scheduled: s.scheduled,
          failed: s.failed,
          partial: s.partial,
          byPlatform,
          daily,
        },
      },
    };
  },
});

// --- view_posts → posts ---
registerWidget({
  tool: "view_posts",
  widget: "posts",
  title: "Posts",
  description:
    "Open an interactive list of posts with their status, schedule, and channels. " +
    "Optionally filter by status.",
  inputSchema: {
    status: z
      .enum([
        "draft",
        "scheduled",
        "publishing",
        "published",
        "failed",
        "partial",
      ])
      .optional()
      .describe("Filter by post status."),
    limit: z.number().optional().describe("Max posts to show (default 20)."),
  },
  outputSchema: {
    posts: z
      .array(
        oItem({
          id: oNum(),
          content: oStr(),
          status: oStr(),
          scheduledAt: oStr(),
          publishedAt: oStr(),
          createdAt: oStr(),
          platforms: z.array(z.string()).nullish(),
        })
      )
      .nullish(),
    total: oNum(),
  },
  load: async ({ status, limit }) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("limit", String(limit ?? 20));
    const res = await api("GET", `/api/posts?${params}`);
    // Normalize: platforms live in postPlatforms[]; flatten to a platform list.
    const posts = asArray(res.data, "posts", "data", "items").map((p) => {
      const o = p as Record<string, any>;
      const platforms = Array.isArray(o.postPlatforms)
        ? o.postPlatforms.map((pp: any) => pp.platform).filter(Boolean)
        : Array.isArray(o.platforms)
          ? o.platforms
          : [];
      return {
        id: o.id,
        content: o.content,
        status: o.status,
        scheduledAt: o.scheduledAt,
        publishedAt: o.publishedAt,
        createdAt: o.createdAt,
        platforms,
      };
    });
    return {
      text: res.ok ? `Showing ${posts.length} post(s).` : formatResponse(res),
      data: { posts, total: asObject(res.data).total ?? posts.length },
    };
  },
});

// --- view_channels → channels ---
registerWidget({
  tool: "view_channels",
  widget: "channels",
  title: "Channels",
  description:
    "Open an interactive view of connected social channels with platform, account, " +
    "and connection/token status.",
  inputSchema: {},
  outputSchema: {
    channels: z
      .array(
        oItem({
          channelId: oNum(),
          platform: oStr(),
          accountName: oStr(),
          active: z.boolean().nullish(),
          status: oStr(),
        })
      )
      .nullish(),
  },
  load: async () => {
    const res = await api("GET", "/api/channels");
    const channels = asArray(res.data, "channels", "data").map((c) => {
      const o = c as Record<string, any>;
      const tokenStatus = o.tokenStatus as string | undefined;
      return {
        channelId: o.channelId ?? o.id,
        platform: o.platform,
        accountName: o.accountName ?? o.name ?? o.username,
        active: o.isActive ?? o.active,
        status: o.needsReconnect
          ? "needs reconnect"
          : tokenStatus && tokenStatus !== "valid"
            ? tokenStatus.replace(/_/g, " ")
            : undefined,
      };
    });
    return {
      text: res.ok
        ? `${channels.length} connected channel(s).`
        : formatResponse(res),
      data: { channels },
    };
  },
});

// --- view_media → media ---
registerWidget({
  tool: "view_media",
  widget: "media",
  title: "Media library",
  description:
    "Open an interactive gallery of uploaded media files with thumbnails and metadata.",
  inputSchema: {
    limit: z.number().optional().describe("Max items to show (default 30)."),
  },
  outputSchema: {
    media: z
      .array(
        oItem({
          id: oNum(),
          url: oStr(),
          filename: oStr(),
          mimeType: oStr(),
          width: oNum(),
          height: oNum(),
        })
      )
      .nullish(),
  },
  load: async ({ limit }) => {
    const res = await api("GET", `/api/media?limit=${limit ?? 30}`);
    // Normalize: array key is `files`; URLs are preview/thumbnail/original.
    const media = asArray(res.data, "files", "media", "data", "items").map(
      (m) => {
        const o = m as Record<string, any>;
        return {
          id: o.id,
          url: o.previewUrl ?? o.thumbnailUrl ?? o.originalUrl ?? o.url,
          filename: o.fileName ?? o.filename ?? o.name,
          mimeType: o.mimeType ?? o.type,
          width: o.width,
          height: o.height,
        };
      }
    );
    return {
      text: res.ok
        ? `Showing ${media.length} media file(s).`
        : formatResponse(res),
      data: { media },
    };
  },
});

// --- view_quota → quota ---
// Same HIDE_BILLING_TOOLS gate as get_quota_usage — this widget is the most
// explicit "you're on a paid SaaS" surface in the app (renders the plan name
// and progress bars against paid-tier limits), so it's the first to drop.
if (!HIDE_BILLING_TOOLS) {
  registerWidget({
    tool: "view_quota",
    widget: "quota",
    title: "Account usage",
    description:
      "Open an interactive view of current account usage — daily/monthly post " +
      "counts, channel counts, and media storage.",
    inputSchema: {},
    outputSchema: {
      // usage maps a label → { used, limit }, plus an optional "plan" string.
      usage: z
        .record(
          z.string(),
          z.union([z.string(), oItem({ used: oNum(), limit: oNum() })])
        )
        .nullish(),
    },
    load: async () => {
      const res = await api("GET", "/api/quotas/usage");
      // Normalize: API returns parallel limits{} + usage{} maps with different
      // key names; pair them into { label: { used, limit } } for the View.
      const root = asObject(res.data);
      const limits = asObject(root.limits);
      const used = asObject(root.usage);
      const MB = 1048576;
      const rows: Array<[string, unknown, unknown]> = [
        ["Channels", used.channels, limits.channels],
        ["Posts / day", used.postsToday, limits.postsPerDay],
        ["Posts / month", used.postsThisMonth, limits.postsPerMonth],
        ["Pending scheduled", used.pendingScheduled, limits.maxPendingScheduled],
        ["Recurring schedules", used.recurringSchedules, limits.recurringSchedules],
        ["Media storage", Number(used.mediaStorageMB) * MB, Number(limits.mediaStorageMB) * MB],
        ["API keys", used.apiKeys, limits.apiKeys],
        ["Webhooks", used.webhooks, limits.webhooks],
        ["Labels", used.labels, limits.maxLabels],
        ["Org members", used.orgMembers, limits.maxOrgMembers],
      ];
      const usage: Record<string, unknown> = {};
      if (root.plan) usage.plan = root.plan;
      for (const [label, u, l] of rows) {
        if (u === undefined && l === undefined) continue;
        usage[label] = { used: u ?? 0, limit: l ?? null };
      }
      return {
        text: res.ok
          ? `${used.channels ?? 0} channels, ${used.postsThisMonth ?? 0} posts this month.`
          : formatResponse(res),
        data: { usage },
      };
    },
  });
}

  // ---------------------------------------------------------------------------
  // Tools: media upload (presigned direct-to-R2). Paired helpers the composer
  // uses to upload a file the user picks — reserve a presigned URL, the browser
  // PUTs the bytes straight to R2, then finalize records the media file. This is
  // how the sandboxed composer uploads without holding credentials. For scripted
  // uploads, prefer upload_media (URL or local path).
  // ---------------------------------------------------------------------------

  server.tool(
    "create_media_upload",
    "Reserve a presigned R2 upload URL for a direct browser upload (used by the composer UI). For scripted uploads use upload_media instead.",
    {
      contentType: z
        .string()
        .describe("File MIME type, e.g. image/png or video/mp4."),
      sizeBytes: z.number().describe("File size in bytes."),
    },
    async ({ contentType, sizeBytes }) => {
      const res = await api("POST", "/api/media/presign", {
        contentType,
        sizeBytes,
      });
      return { content: [{ type: "text" as const, text: formatResponse(res) }] };
    }
  );

  server.tool(
    "finalize_media_upload",
    "Record an uploaded R2 object as a media file after the browser PUT (pairs with create_media_upload; used by the composer UI).",
    {
      r2Key: z.string().describe("The r2Key returned by create_media_upload."),
      fileName: z.string().describe("Original file name."),
      mimeType: z.string().describe("File MIME type."),
      sizeBytes: z.number().describe("File size in bytes."),
      width: z.number().optional().describe("Pixel width (images/video)."),
      height: z.number().optional().describe("Pixel height (images/video)."),
      duration: z.number().optional().describe("Duration in seconds (video)."),
    },
    async ({ r2Key, fileName, mimeType, sizeBytes, width, height, duration }) => {
      const body: Record<string, unknown> = {
        r2Key,
        fileName,
        mimeType,
        sizeBytes,
      };
      if (width !== undefined) body.width = width;
      if (height !== undefined) body.height = height;
      if (duration !== undefined) body.duration = duration;
      const res = await api("POST", "/api/media/finalize", body);
      return { content: [{ type: "text" as const, text: formatResponse(res) }] };
    }
  );

  return server;
}

// ---------------------------------------------------------------------------
// Smithery sandbox export (for tool scanning without real credentials)
// ---------------------------------------------------------------------------

export function createSandboxServer(): McpServer {
  return createServer();
}

// ---------------------------------------------------------------------------
// Start server (only when run directly, not when imported by Smithery)
// ---------------------------------------------------------------------------

const isDirectRun =
  !process.env.SMITHERY_SCAN &&
  process.argv[1] &&
  (process.argv[1].endsWith("index.js") ||
    process.argv[1].endsWith("index.ts"));

if (isDirectRun) {
  if (!API_KEY) {
    // Don't exit — starting without a key lets registries/hosts (e.g. Smithery)
    // connect and enumerate tools during their scan. Tool *calls* will fail
    // until a key is provided, with a clear error.
    console.error(
      "Warning: BULKPUBLISH_API_KEY is not set — tool calls will fail until it is provided.\n" +
        "Get your API key at https://app.bulkpublish.com/developer"
    );
  }

  const server = createServer();
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
}
