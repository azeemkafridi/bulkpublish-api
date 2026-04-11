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
    Authorization: `Bearer ${API_KEY}`,
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

const server = new McpServer({
  name: "bulkpublish",
  version: "1.0.0",
});

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
        Authorization: `Bearer ${API_KEY}`,
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
// Tool: get_quota_usage
// ---------------------------------------------------------------------------

server.tool(
  "get_quota_usage",
  "Check current quota usage for your BulkPublish plan. Returns daily/monthly post limits, scheduled post limits, channel limits, media storage usage, and more.",
  {},
  async () => {
    const res = await api("GET", "/api/quotas/usage");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

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
// Smithery sandbox export (for tool scanning without real credentials)
// ---------------------------------------------------------------------------

export function createSandboxServer() {
  return server;
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
    console.error(
      "Error: BULKPUBLISH_API_KEY environment variable is required.\n" +
        "Get your API key at https://app.bulkpublish.com/developer"
    );
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
}
