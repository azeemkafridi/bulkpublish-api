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

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const API_KEY = process.env.BULKPUBLISH_API_KEY;
const BASE_URL = (
  process.env.BULKPUBLISH_BASE_URL || "https://app.bulkpublish.com"
).replace(/\/+$/, "");

if (!API_KEY) {
  console.error(
    "Error: BULKPUBLISH_API_KEY environment variable is required.\n" +
      "Get your API key at https://app.bulkpublish.com/developer"
  );
  process.exit(1);
}

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
// Tool: create_post
// ---------------------------------------------------------------------------

server.tool(
  "create_post",
  "Create a new social media post. Can be saved as a draft or scheduled for a specific time. Supports platform-specific content overrides, media attachments, labels, and thread format.",
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
  }) => {
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
  "Upload a media file (image or video) from a URL. The file is downloaded and stored in BulkPublish for use in posts. Supported formats: JPEG, PNG, WebP, GIF, MP4, MOV, WebM. Max 100MB.",
  {
    url: z.string().describe("Public URL of the media file to upload."),
    filename: z
      .string()
      .optional()
      .describe(
        "Optional filename. If omitted, derived from the URL."
      ),
  },
  async ({ url: mediaUrl, filename }) => {
    // Download the file from the URL
    let fileResponse: Response;
    try {
      fileResponse = await fetch(mediaUrl);
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

    const contentType =
      fileResponse.headers.get("content-type") || "application/octet-stream";
    const blob = await fileResponse.blob();

    // Derive filename from URL if not provided
    const derivedFilename =
      filename ||
      mediaUrl.split("/").pop()?.split("?")[0] ||
      "upload";

    // Build multipart form data
    const formData = new FormData();
    formData.append("file", new File([blob], derivedFilename, { type: contentType }));

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
// Start server
// ---------------------------------------------------------------------------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start MCP server:", err);
  process.exit(1);
});
