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
// Shared input schemas — typed so OpenAI's "Unclear Arguments" review doesn't
// flag create_post/update_post for free-string platform / status / nested
// objects. Shapes mirror webapp/src/components/compose/PlatformOptions.tsx;
// per-platform sub-objects use .passthrough() so undeclared advanced fields
// still flow through to the API.
// ---------------------------------------------------------------------------

const PLATFORM_ENUM = z.enum([
  "facebook",
  "instagram",
  "x",
  "tiktok",
  "youtube",
  "threads",
  "bluesky",
  "pinterest",
  "gmb",
  "linkedin",
  "mastodon",
  "reddit",
  "discord",
  "telegram",
  "tumblr",
  "snapchat",
]);

const POST_TYPE_OVERRIDES_SCHEMA = z
  .object({
    instagram: z
      .enum(["feed_photo", "feed_video", "reel", "story", "carousel"])
      .optional(),
    facebook: z.enum(["post", "video", "reel", "story", "carousel"]).optional(),
    x: z.enum(["tweet", "video", "thread", "repost"]).optional(),
    tiktok: z.enum(["video", "photo_slideshow"]).optional(),
    youtube: z.enum(["video", "short"]).optional(),
    threads: z.enum(["text", "image", "video", "carousel", "repost"]).optional(),
    bluesky: z.enum(["post", "video", "thread", "repost"]).optional(),
    linkedin: z.enum(["post", "multi_image", "pdf_carousel", "article"]).optional(),
    pinterest: z.enum(["pin", "video_pin", "carousel"]).optional(),
    gmb: z.enum(["standard", "event", "offer"]).optional(),
    mastodon: z.enum(["post", "thread", "repost"]).optional(),
    reddit: z.enum(["post"]).optional(),
    discord: z.enum(["post"]).optional(),
    telegram: z.enum(["post"]).optional(),
    tumblr: z.enum(["post"]).optional(),
    snapchat: z
      .enum(["story", "saved_story", "spotlight"])
      .optional()
      .describe(
        "story (default): 1 image or video, caption NOT sent. saved_story: 1 image or video with a title. spotlight: video only, 6\u201360s, caption becomes the description."
      ),
  })
  .optional()
  .describe(
    'Per-platform post type override. E.g. { "instagram": "reel", "youtube": "short" }.'
  );

// Reddit, Discord, Tumblr and Snapchat nest their options under the BulkPublish channel
// id (e.g. { "12": { … } }) because each connected account commonly targets a
// different subreddit / Discord channel / blog. The server also accepts a FLAT
// object, which applies to every channel of that platform on the post, so both
// shapes have to validate here.
const REDDIT_OPTIONS = z
  .object({
    subreddit: z
      .string()
      .optional()
      .describe(
        "Required. Target subreddit — 'webdev', 'r/webdev' and '/r/webdev' are all accepted. Falls back to the subreddit stored on the channel."
      ),
    title: z
      .string()
      .optional()
      .describe(
        "Post title. Defaults to the first line of content, truncated to 300 characters."
      ),
    type: z
      .string()
      .optional()
      .describe(
        "Set to 'link' to force a link submission. Otherwise the kind is resolved from media: image -> image, video -> video, url set -> link, else self (text)."
      ),
    url: z
      .string()
      .optional()
      .describe("Destination URL for a link post; implies type 'link'."),
    flairId: z
      .string()
      .optional()
      .describe("Link-flair id (list via get_channel_options)."),
    thumbnailUrl: z
      .string()
      .optional()
      .describe(
        "Poster image URL for video posts. Optional — when omitted the server falls back to the video's auto-extracted poster frame, failing only if neither exists. Unlike Pinterest's coverImageUrl there is no attached-image fallback, because a Reddit media post accepts exactly one file."
      ),
  })
  .passthrough();

const DISCORD_OPTIONS = z
  .object({
    channelId: z
      .string()
      .optional()
      .describe(
        "Required. Target Discord text channel id (a snowflake) inside the connected server. NOT the BulkPublish channel id used as the outer key. List postable channels via get_channel_options."
      ),
  })
  .passthrough();

const TUMBLR_OPTIONS = z
  .object({
    blogName: z
      .string()
      .optional()
      .describe(
        "Which blog to publish to. Defaults to the blog the channel was connected as (list via get_channel_options)."
      ),
    title: z
      .string()
      .optional()
      .describe("Rendered as a heading block above the body."),
    tags: z
      .array(z.string())
      .optional()
      .describe("Tumblr tags, without the leading '#'."),
    link: z.string().optional().describe("Appended as a link block."),
    sourceUrl: z
      .string()
      .optional()
      .describe("Attribution URL stored as the post's source."),
  })
  .passthrough();

const SNAPCHAT_OPTIONS = z
  .object({
    title: z
      .string()
      .optional()
      .describe(
        "Saved Story title (max 45 chars). Defaults to the first line of the caption, truncated."
      ),
    locale: z
      .string()
      .optional()
      .describe("Spotlight locale, e.g. 'en_US'. Defaults to 'en_US'."),
    saveToProfile: z
      .boolean()
      .optional()
      .describe(
        "Spotlight only. Default true; false sends skip_save_to_profile to Snap."
      ),
  })
  .passthrough();

/** Accept both the channel-id-keyed form and the flat form. */
const channelKeyedOrFlat = <T extends z.ZodTypeAny>(inner: T) =>
  z.union([z.record(z.string(), inner), inner]);

const PLATFORM_SPECIFIC_SCHEMA = z
  .object({
    youtube: z
      .object({
        title: z.string().optional(),
        privacyStatus: z.enum(["public", "private", "unlisted"]).optional(),
        categoryId: z.string().optional(),
        madeForKids: z.boolean().optional(),
        playlistId: z.string().optional(),
        thumbnailUrl: z.string().optional(),
      })
      .passthrough()
      .optional(),
    pinterest: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        link: z.string().optional(),
        dominantColor: z.string().optional().describe("Hex color e.g. #FF5733"),
        coverImageUrl: z
          .string()
          .optional()
          .describe(
            "Cover image URL for video pins. Optional — server falls back to an attached image, then the video's auto-extracted poster frame."
          ),
      })
      .passthrough()
      .optional(),
    gmb: z
      .object({
        ctaType: z.string().optional(),
        ctaUrl: z.string().optional(),
        eventTitle: z.string().optional(),
        startDate: z.string().optional(),
        startTime: z.string().optional(),
        endDate: z.string().optional(),
        endTime: z.string().optional(),
        couponCode: z.string().optional(),
        redeemOnlineUrl: z.string().optional(),
        termsConditions: z.string().optional(),
      })
      .passthrough()
      .optional(),
    tiktok: z
      .object({
        privacyLevel: z.string().optional(),
        disableDuet: z.boolean().optional(),
        disableStitch: z.boolean().optional(),
        disableComment: z.boolean().optional(),
        isAigc: z.boolean().optional(),
        brandContentToggle: z.boolean().optional(),
        brandOrganicToggle: z.boolean().optional(),
        thumbnailTimestamp: z
          .number()
          .optional()
          .describe("Cover frame for the video, in seconds from the start."),
      })
      .passthrough()
      .optional(),
    x: z
      .object({
        replySettings: z.string().optional(),
        repostId: z.string().optional().describe("With postTypeOverrides.x = 'repost': the X post URL or ID to repost (retweet)."),
      })
      .passthrough()
      .optional(),
    facebook: z
      .object({
        shareToStory: z.boolean().optional(),
        thumbnailUrl: z
          .string()
          .optional()
          .describe(
            "Cover image URL for a video or Reel. Facebook only accepts a cover once the video exists, so it is applied after the video publishes and appears a moment after the post; a cover that cannot be fetched or that Facebook rejects leaves the video published with Facebook's own chosen frame rather than failing the post."
          ),
      })
      .passthrough()
      .optional(),
    instagram: z
      .object({
        collaborators: z
          .string()
          .optional()
          .describe(
            "Comma-separated Instagram usernames (no leading @) tagged as co-authors. Applies with postTypeOverrides.instagram of 'feed_photo', 'feed_video', 'reel' or 'carousel' \u2014 on a carousel the co-authors are set on the carousel itself, not on its individual items. Ignored on 'story', which has no co-author concept."
          ),
        shareToStory: z.boolean().optional(),
        trialReel: z
          .boolean()
          .optional()
          .describe(
            "Publish as a trial reel, shown to people who do not follow the account first. Only takes effect with postTypeOverrides.instagram of 'reel' \u2014 a 'feed_video' publishes as an ordinary reel and this is ignored, even though both use the same underlying reel container."
          ),
        graduationStrategy: z
          .enum(["manual", "auto"])
          .optional()
          .describe(
            "How a trial reel becomes a normal one: 'manual' (the creator releases it) or 'auto' (released automatically if it performs well). Default 'manual'. Ignored unless trialReel is true."
          ),
        thumbnailTimestamp: z
          .number()
          .optional()
          .describe(
            "Cover frame for a video or Reel, in seconds from the start. Applies to postTypeOverrides.instagram of 'feed_video' or 'reel'. Ignored when coverUrl is also set."
          ),
        coverUrl: z
          .string()
          .optional()
          .describe(
            "Cover image URL for a video or Reel. Takes precedence over thumbnailTimestamp: Instagram accepts one or the other and rejects a request carrying both, so only this one is forwarded when both are sent."
          ),
      })
      .passthrough()
      .optional(),
    threads: z
      .object({
        quotePostId: z.string().optional(),
        repostId: z.string().optional().describe("With postTypeOverrides.threads = 'repost': the numeric ID of the Threads post to repost (Threads links cannot be used; the ID of a post published through BulkPublish is in get_post's platforms[].platformPostId)."),
        topicTag: z
          .string()
          .optional()
          .describe("One topic tag for the post, without a leading '#'. Must not contain periods or ampersands."),
        locationId: z
          .string()
          .optional()
          .describe("Numeric place ID from get_channel_options with a `q` search on a Threads channel. Only works once the channel has granted location tagging."),
      })
      .passthrough()
      .optional(),
    linkedin: z.object({}).passthrough().optional(),
    bluesky: z.object({ repostId: z.string().optional().describe("With postTypeOverrides.bluesky = 'repost': the bsky.app post URL (or at:// URI) to repost.") }).passthrough().optional(),
    mastodon: z.object({ repostId: z.string().optional().describe("With postTypeOverrides.mastodon = 'repost': the status URL or ID to boost.") }).passthrough().optional(),
    reddit: channelKeyedOrFlat(REDDIT_OPTIONS)
      .optional()
      .describe(
        'Reddit options, nested under the BulkPublish channel id: { "12": { "subreddit": "webdev" } }. A flat object (e.g. { "subreddit": "webdev" }) applies to every Reddit channel on the post. subreddit is required; a media post accepts exactly one file.'
      ),
    discord: channelKeyedOrFlat(DISCORD_OPTIONS)
      .optional()
      .describe(
        'Discord options, nested under the BulkPublish channel id: { "12": { "channelId": "1090123456789012345" } }. A flat object applies to every Discord channel on the post. The inner channelId is the target Discord text channel. Posting uses a global bot token, so failures are permission problems, never a reconnect issue.'
      ),
    telegram: z
      .object({})
      .passthrough()
      .optional()
      .describe(
        "Telegram accepts no options — the destination chat is fixed when the channel is connected. Content is sent as plain text (no markdown). Text over the 1024-char caption limit is posted as a second message alongside captionless media."
      ),
    tumblr: channelKeyedOrFlat(TUMBLR_OPTIONS)
      .optional()
      .describe(
        'Tumblr options, nested under the BulkPublish channel id: { "12": { "blogName": "myblog", "tags": ["art"] } } (tags: array of strings or one comma-separated string). A flat object applies to every Tumblr channel on the post. Up to 30 images OR exactly one video per post.'
      ),
    snapchat: channelKeyedOrFlat(SNAPCHAT_OPTIONS)
      .optional()
      .describe(
        'Snapchat options, nested under the BulkPublish channel id: { "12": { "title": "My story" } }. A flat object applies to every Snapchat channel on the post. Post types: story (default), saved_story, spotlight. Every Snapchat post requires exactly ONE image or video (vertical, videos 5\u201360s, spotlight 6\u201360s video-only, max 1GB). The caption is NOT sent for plain stories \u2014 it is only the Spotlight description (160 chars max) and the Saved Story title fallback. First comments are not supported.'
      ),
  })
  .optional()
  .describe(
    'Platform-specific settings, e.g. { "youtube": { "title": "…", "privacyStatus": "public" } }. Reddit, Discord, Tumblr and Snapchat nest their options under the BulkPublish channel id, e.g. { "reddit": { "12": { "subreddit": "webdev" } } }. Telegram takes no options.'
  );

const PLATFORM_CONTENT_SCHEMA = z
  .object({
    facebook: z.string().optional(),
    instagram: z.string().optional(),
    x: z.string().optional(),
    tiktok: z.string().optional(),
    youtube: z.string().optional(),
    threads: z.string().optional(),
    bluesky: z.string().optional(),
    pinterest: z.string().optional(),
    linkedin: z.string().optional(),
    mastodon: z.string().optional(),
    gmb: z.string().optional(),
    reddit: z.string().optional(),
    discord: z.string().optional(),
    telegram: z.string().optional(),
    tumblr: z.string().optional(),
    snapchat: z.string().optional(),
  })
  .optional()
  .describe(
    'Per-platform content overrides, e.g. { "x": "Short tweet", "linkedin": "Longer LinkedIn post" }.'
  );

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
    // The API answers with either { error: { message, code } } or a bare
    // { error: "text" }. The bare form used to fall through to "HTTP 400
    // error" — the generic error the directory review rejects.
    const err = res.data as { error?: string | { message?: string }; message?: string };
    const msg =
      (typeof err?.error === "string" ? err.error : err?.error?.message) ||
      err?.message ||
      `HTTP ${res.status} error`;
    return `Error: ${msg}`;
  }
  return JSON.stringify(res.data, null, 2);
}

// ---------------------------------------------------------------------------
// Tool output schemas (MCP Connectors Directory recommendation)
// ---------------------------------------------------------------------------
// OpenAI's review flags every tool with no outputSchema: without one the host
// only sees an opaque JSON blob in a text block. The five widget tools declare
// theirs inline (registerWidget); these are the fifteen plain tools.
//
// Deliberately lenient, same rule as the widget schemas: every field optional
// and nullable, numerics accept string-encoded values, objects pass extras
// through. The schema documents the shape for the host without ever rejecting
// real API output — and the SDK REJECTS the whole call when structuredContent
// fails validation, so a strict schema here would turn a cosmetic warning into
// an outage. Shapes traced from the webapp handlers, not guessed.
const sStr = () => z.string().nullish();
const sNum = () => z.union([z.number(), z.string()]).nullish();
const sBool = () => z.boolean().nullish();
const sObj = (shape: Record<string, z.ZodTypeAny> = {}) =>
  z.object(shape).passthrough().nullish();
const sArr = (shape: Record<string, z.ZodTypeAny> = {}) =>
  z.array(z.object(shape).passthrough()).nullish();

// One post, as returned by GET/POST/PATCH /api/posts[/{id}] and the publish route.
const POST_SHAPE: Record<string, z.ZodTypeAny> = {
  id: sNum(),
  content: sStr(),
  status: sStr().describe("draft, scheduled, processing, published, partial or failed."),
  scheduledAt: sStr(),
  timezone: sStr(),
  publishedAt: sStr(),
  createdAt: sStr(),
  approvalStatus: sStr(),
  author: sObj().describe("Who wrote the post: { id, name, image }. Null when that account is gone."),
  approver: sObj().describe("Who approved it: { id, name, image }. Null unless approvalStatus is approved."),
  assignee: sObj().describe("Who is expected to act on it next: { id, name, image }. Null when nobody is."),
  // POST and PATCH /api/posts echo the stored row, where this is the list of
  // media file IDs; GET resolves them to file objects. Declaring objects only
  // made every create_post/update_post WITH media fail output validation after
  // the post had already been saved (2026-09-11) — the host then reported an
  // error for a post that existed, which is how a retry duplicates it.
  mediaFiles: z.array(z.union([z.number(), z.string(), z.object({}).passthrough()])).nullish(),
  postPlatforms: sArr({ platform: sStr(), status: sStr() }),
  labels: sArr(),
};

export const TOOL_OUTPUT_SCHEMAS: Record<string, Record<string, z.ZodTypeAny>> = {
  list_channels: {
    channels: sArr({ channelId: sNum(), platform: sStr(), accountName: sStr(), active: sBool() }),
    capabilities: sObj().describe("Whether the caller may create, publish or approve posts."),
  },
  list_posts: {
    posts: sArr(POST_SHAPE),
    total: sNum(), page: sNum(), limit: sNum(), totalPages: sNum(),
  },
  get_post: POST_SHAPE,
  create_post: POST_SHAPE,
  update_post: POST_SHAPE,
  publish_post: POST_SHAPE,
  retry_post: {
    ...POST_SHAPE,
    retriedCount: sNum().describe("How many destinations were retried."),
    skippedMaxRetries: sNum().describe("Destinations skipped for hitting the retry ceiling."),
  },
  delete_post: { success: sBool() },
  get_post_metrics: { postId: sNum(), platforms: sArr({ platform: sStr() }), totals: sObj() },
  get_queue_slot: {
    scheduledAt: sStr().describe("ISO timestamp of the next free slot."),
    dayLabel: sStr().describe('Human label, e.g. "Today" or "Wed, Feb 14".'),
  },
  list_media: {
    files: sArr({ id: sNum(), url: sStr(), filename: sStr(), mimeType: sStr(), sizeBytes: sNum() }),
    page: sNum(), limit: sNum(), total: sNum(),
  },
  upload_media: { file: sObj(), id: sNum(), url: sStr(), filename: sStr(), mimeType: sStr(), sizeBytes: sNum() },
  create_media_upload: { uploadUrl: sStr(), r2Key: sStr(), expiresIn: sNum() },
  finalize_media_upload: { file: sObj({ id: sNum(), url: sStr(), filename: sStr() }) },
  get_analytics: {
    totalPosts: sNum(), published: sNum(), failed: sNum(), scheduled: sNum(), partial: sNum(),
    from: sStr(), to: sStr(),
    byPlatform: sObj(), byDay: sArr(), publishedTimes: z.array(z.any()).nullish(),
    previous: sObj(), previousWindow: sObj(),
  },
};

// Turns a plain tool's text-only result into one carrying structuredContent,
// which the SDK requires whenever a tool declares an outputSchema. formatResponse
// prefixes every failure with "Error: " (both the API's !ok path and the local
// guards, e.g. an unreadable file), and the SDK skips validation when isError is
// set — so failures are flagged rather than forced to fit the success schema.
function attachStructured(result: unknown, toolName: string): unknown {
  if (!result || typeof result !== "object") return result;
  const r = result as Record<string, unknown>;
  if (!("content" in r) || r.structuredContent !== undefined) return result;
  const first = Array.isArray(r.content) ? (r.content[0] as { text?: string }) : undefined;
  const text = typeof first?.text === "string" ? first.text : "";
  if (r.isError === true || text.startsWith("Error: ")) return { ...r, isError: true };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not JSON: no structured view to offer. Flagging it as an error is honest —
    // the alternative is the SDK throwing "no structured content was provided".
    return { ...r, isError: true };
  }
  const data =
    Array.isArray(parsed) ? { items: parsed }
    : parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>)
    : { value: parsed };
  return { ...r, structuredContent: data };
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------


// ---------------------------------------------------------------------------
// Tool profiles
// ---------------------------------------------------------------------------
// The hosted server (mcp.bulkpublish.com) is what the Anthropic and OpenAI
// directories review, and 71 tools is more surface than a reviewer can verify
// or a chat model can pick from well. `core` is the publishing workflow only:
// channels, posts, media, analytics, and the panels — 20 tools. Everything a
// panel calls back through the host bridge (create_post, publish_post,
// retry_post, update_post, delete_post, list_channels, list_media,
// create_media_upload, finalize_media_upload, get_post) MUST stay in core or
// the panel's buttons break. `full` is every tool; the npm/stdio server
// defaults to it so existing local setups lose nothing.
//
// BULKPUBLISH_TOOL_PROFILE=core|full overrides either default.
export type ToolProfile = "core" | "full";
export const CORE_TOOLS: ReadonlySet<string> = new Set([
  "list_channels",
  "list_posts",
  "get_post",
  "create_post",
  "update_post",
  "delete_post",
  "publish_post",
  "retry_post",
  "get_queue_slot",
  "upload_media",
  "list_media",
  "create_media_upload",
  "finalize_media_upload",
  "get_analytics",
  "get_post_metrics",
  "compose_post",
  "view_posts",
  "view_channels",
  "view_media",
  "view_analytics",
]);
export function resolveToolProfile(fallback: ToolProfile): ToolProfile {
  const v = process.env.BULKPUBLISH_TOOL_PROFILE;
  if (v === "core" || v === "full") return v;
  if (v) console.error(`Warning: BULKPUBLISH_TOOL_PROFILE=${v} is not core|full — using ${fallback}.`);
  return fallback;
}
function toolInProfile(name: string, profile: ToolProfile): boolean {
  return profile === "full" || CORE_TOOLS.has(name);
}

// ---------------------------------------------------------------------------
// Tool annotations
// ---------------------------------------------------------------------------
// Every hint is REQUIRED and explicit. OpenAI's plugin review (2026-09-09
// rejection of v1.0.1) asks that each annotation be "explicitly set to true
// or false (not null) for every tool" and that the values match what the
// tool actually does, with a written justification. The `why` line IS that
// justification — `npm run check:annotations` prints the table pasted into
// the submission form, so the form and the server cannot drift.
//
// Definitions used (OpenAI app-review + MCP spec):
//   readOnlyHint    true only if the call changes nothing.
//   destructiveHint true if the call can delete, overwrite, revoke access, or
//                   trigger something that cannot be undone — even in one
//                   mode or via an indirect effect. Publishing to a public
//                   platform cannot be undone from here, so it counts.
//   openWorldHint   true if the call reaches the public internet or an
//                   external entity: publishes to a platform, fetches a
//                   remote URL, or schedules content that will publish.
//   idempotentHint  true if repeating the call with the same arguments
//                   leaves the same state as calling it once.
type ToolAnn = {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
  why: string;
};
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
export const TOOL_ANNOTATIONS: Record<string, ToolAnn> = {
  // ---- Read-only: GET against the caller's own BulkPublish account -------
  list_channels: { title: "List channels", ...READ, why: "GET /api/channels. Lists the caller's connected accounts; changes nothing, calls no platform." },
  list_platforms: { title: "List platforms", ...READ, why: "GET /api/platforms. Returns which platforms are enabled; changes nothing." },
  list_posts: { title: "List posts", ...READ, why: "GET /api/posts with filters; a paginated read of the caller's own posts." },
  get_post: { title: "Get post", ...READ, why: "GET /api/posts/{id}; reads one post." },
  get_post_metrics: { title: "Get post metrics", ...READ, why: "GET stored metrics for one post; nothing is fetched from a platform during the call." },
  list_media: { title: "List media", ...READ, why: "GET /api/media; lists the caller's media library." },
  get_media: { title: "Get media file", ...READ, why: "GET /api/media/{id}; reads one file's record." },
  list_labels: { title: "List labels", ...READ, why: "GET /api/labels." },
  list_hashtag_groups: { title: "List hashtag groups", ...READ, why: "GET /api/hashtag-groups." },
  list_templates: { title: "List post templates", ...READ, why: "GET /api/templates." },
  list_review_links: { title: "List client review links", ...READ, why: "GET /api/review-links; lists links already created, does not create or revoke any." },
  list_client_connect_links: { title: "List client connect links", ...READ, why: "GET /api/client-connect-links; read of existing links." },
  list_calendar_notes: { title: "List calendar notes", ...READ, why: "GET /api/calendar-notes for a date range." },
  list_schedules: { title: "List recurring schedules", ...READ, why: "GET /api/schedules." },
  get_analytics: { title: "Get analytics", ...READ, why: "GET /api/analytics/summary; aggregates already-stored metrics." },
  get_quota_usage: { title: "Get quota usage", ...READ, why: "GET /api/quotas/usage; reads plan limits and current counters." },
  get_queue_slot: { title: "Get next queue slot", ...READ, why: "GET /api/posts/queue-slot; computes the next free slot and reserves nothing." },
  get_channel_health: { title: "Get channel health", ...READ, why: "GET /api/channels/{id}/health; reports stored token state, does not refresh or reconnect." },
  get_channel_options: { title: "Get channel post-type options", ...READ, why: "GET /api/channels/{id}/options; static capability data." },
  list_channel_sets: { title: "List channel sets", ...READ, why: "GET /api/channel-sets." },
  list_rss_feeds: { title: "List RSS feeds", ...READ, why: "GET /api/rss-feeds; lists configured feeds, fetches none of them." },
  search_mentions: { title: "Search mentions", ...READ, openWorldHint: true, why: "Read-only, but the lookup is proxied to the connected platform's own search (LinkedIn/X), so it reaches an external service." },
  // ---- Widgets: the tool call itself only loads data for the panel -------
  // Any action taken inside the panel is a separate tools/call to the tool
  // named below (create_post, publish_post, delete_post, …), which carries
  // its own annotations, so the loader is honestly read-only.
  compose_post: { title: "Compose a post", ...READ, why: "Loads active channels and recent media (two GETs) to open the composer panel. Submitting the panel calls create_post / publish_post as separate tool calls with their own annotations; this call writes nothing and publishes nothing." },
  view_posts: { title: "View posts", ...READ, why: "GET /api/posts to render the posts panel. Buttons in the panel call publish_post, retry_post, update_post or delete_post separately." },
  view_channels: { title: "View channels", ...READ, why: "GET /api/channels to render the channels panel." },
  view_media: { title: "View media", ...READ, why: "GET /api/media to render the media panel." },
  view_analytics: { title: "View analytics", ...READ, why: "GET /api/analytics/summary to render the analytics panel." },
  view_quota: { title: "View quota", ...READ, why: "GET /api/quotas/usage to render the usage panel." },
  // ---- Creates: add a record, overwrite nothing --------------------------
  create_post: { title: "Create post", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, why: "POST /api/posts. Adds a draft or scheduled post; overwrites nothing and can be deleted, so not destructive. Not idempotent: each call creates another post. Open-world: with status 'scheduled' the post will publish to the named public platforms at scheduledAt, so the call's effect reaches outside BulkPublish." },
  create_label: { title: "Create label", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/labels; adds an internal label. Repeating creates a duplicate." },
  create_hashtag_group: { title: "Create hashtag group", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/hashtag-groups; adds an internal record." },
  create_template: { title: "Create post template", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/templates; adds an internal record." },
  create_calendar_note: { title: "Create calendar note", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/calendar-notes; adds an internal note, publishes nothing." },
  create_channel_set: { title: "Create channel set", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/channel-sets; adds an internal grouping." },
  create_schedule: { title: "Create recurring schedule", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, why: "POST /api/schedules. Adds a rule that will create and publish posts to public platforms on a cadence, so its effect is open-world; the rule itself can be deleted, so not destructive." },
  create_rss_feed: { title: "Add RSS feed", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, why: "POST /api/rss-feeds. BulkPublish will fetch the given public feed URL and publish new items to the chosen channels, so the effect is open-world. The feed record can be paused or deleted." },
  create_review_link: { title: "Create client review link", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/review-links; mints a link that a client can open. Nothing is sent to anyone; the caller decides where to share it." },
  create_client_connect_link: { title: "Create client connect link", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/client-connect-links; mints a one-time link. Nothing is sent to anyone." },
  share_post: { title: "Create post review link", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, why: "POST /api/posts/{id}/share returns the post's review link, creating it on first call; repeating returns the same link unless regenerate=true. Nothing is sent to anyone." },
  // ---- Media uploads -----------------------------------------------------
  upload_media: { title: "Upload media", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true, why: "Downloads the file from the given public URL (or reads a local path) and stores it in the caller's library — fetching an arbitrary URL is an open-world read. Adds a file, overwrites nothing; each call stores another copy." },
  create_media_upload: { title: "Start media upload", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/media/presign; reserves an upload slot and returns a signed URL. Stores no file yet, overwrites nothing." },
  finalize_media_upload: { title: "Finalize media upload", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "POST /api/media/finalize; records the uploaded object as a library file. Overwrites nothing." },
  create_multipart_upload: { title: "Start chunked media upload", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "Reserves a chunked upload; stores nothing final." },
  complete_multipart_upload: { title: "Complete chunked media upload", readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false, why: "Assembles the uploaded parts into one library file. Overwrites nothing." },
  abort_multipart_upload: { title: "Abort chunked media upload", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "Discards the parts uploaded so far; they cannot be recovered. Aborting twice is a no-op." },
  // ---- Updates: overwrite fields of an existing record -------------------
  // Overwriting is 'destructive' under the review definition even though
  // the record survives, because the previous value is not recoverable.
  update_post: { title: "Update post", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, why: "PATCH /api/posts/{id}. Overwrites the post's content, media, labels or schedule; the previous values are not kept, so destructive. Open-world: status='scheduled' arms the post to publish to public platforms. Same payload twice leaves the same state." },
  update_media: { title: "Set media alt text", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "PATCH /api/media/{id}; overwrites the alt text (previous value not kept). Same value twice is a no-op." },
  update_label: { title: "Update label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "PATCH; overwrites name/colour." },
  update_hashtag_group: { title: "Update hashtag group", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "PATCH; overwrites the group's name or hashtags." },
  update_template: { title: "Update post template", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "PATCH; overwrites the template's text." },
  update_calendar_note: { title: "Update calendar note", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "PATCH; overwrites the note." },
  update_channel_set: { title: "Update channel set", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "PATCH; overwrites the set's name or members." },
  update_schedule: { title: "Update recurring schedule", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, why: "PATCH; overwrites the rule that generates future public posts." },
  update_rss_feed: { title: "Update RSS feed", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, why: "PATCH; overwrites the feed URL or target channels for future auto-publishing." },
  // ---- Publishing: reaches public platforms, cannot be undone here --------
  publish_post: { title: "Publish post now", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, why: "POST /api/posts/{id}/publish. Sends the post to the connected public platforms immediately; a live post cannot be recalled from BulkPublish, so destructive. Not idempotent: the server refuses to re-publish a live post, but a retry after a lost response can duplicate it." },
  retry_post: { title: "Retry failed post", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, why: "POST /api/posts/{id}/retry. Re-sends to the platforms that failed; with republish=true it can also re-send 'unconfirmed' platforms and create a duplicate. Same reasoning as publish_post." },
  approve_post: { title: "Approve pending post", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true, why: "POST /api/posts/{id}/approve. Releases a post held for team approval so it publishes at its scheduled time (or now) to public platforms. Approving twice is a no-op." },
  reject_post: { title: "Reject pending post", readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, why: "POST /api/posts/{id}/reject. Returns the post to draft with a reason; nothing is published, nothing is deleted, and it can be resubmitted. Rejecting twice is a no-op." },
  publish_story: { title: "Publish story", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, why: "POST /api/posts/{id}/story. Publishes an Instagram/Facebook story immediately; cannot be recalled from here, and each call posts another story." },
  bulk_posts: { title: "Bulk post actions", readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true, why: "POST /api/posts/bulk with action delete | retry | reschedule over many posts. 'delete' removes posts permanently and 'retry' re-publishes to public platforms, so the tool's widest reach is destructive and open-world. Not idempotent because 'retry' can duplicate." },
  // ---- Deletes / revokes ---------------------------------------------------
  delete_post: { title: "Delete post", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/posts/{id}. Permanently removes a draft or failed post (published posts are refused, so nothing is removed from a platform). Deleting twice leaves the same state." },
  delete_media: { title: "Delete media", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/media/{id}; the file is gone." },
  delete_label: { title: "Delete label", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/labels/{id}." },
  delete_hashtag_group: { title: "Delete hashtag group", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/hashtag-groups/{id}." },
  delete_template: { title: "Delete post template", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/templates/{id}." },
  delete_calendar_note: { title: "Delete calendar note", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/calendar-notes/{id}." },
  delete_channel_set: { title: "Delete channel set", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/channel-sets/{id}; the channels themselves stay connected." },
  delete_schedule: { title: "Delete recurring schedule", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/schedules/{id}; stops future generation, posts already created stay." },
  delete_rss_feed: { title: "Delete RSS feed", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/rss-feeds/{id}; stops auto-publishing from that feed." },
  unshare_post: { title: "Revoke post review link", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/posts/{id}/share; revokes access for anyone holding the link." },
  delete_review_link: { title: "Revoke client review link", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/review-links/{id}; revokes access. The posts it covered are unaffected." },
  delete_client_connect_link: { title: "Revoke client connect link", readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false, why: "DELETE /api/client-connect-links/{id}; revokes an unused link. An account it already connected stays connected." },
};

// Build a fully-registered MCP server instance. Called once for stdio (below)
// and once per request by the hosted HTTP server, so each HTTP caller gets an
// isolated server whose tool calls use their own API key via requestContext.
export function createServer(opts: { profile?: ToolProfile } = {}): McpServer {
  const profile: ToolProfile = opts.profile ?? "full";
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
  // "Use this when…" hints appended to each tool's description — OpenAI's Apps
  // SDK + Claude both use these to pick the right tool and disambiguate similar
  // tools. Describe what the tool does and when it is useful only; never
  // instruct the model to avoid its own built-in tools (web search, browsing) —
  // tool choice is the host model's, and steering it fails directory review.
  const TOOL_USE_HINTS: Record<string, string> = {
    list_channels: "the user wants to see which social accounts are connected.",
    list_posts: "the user wants to browse, filter, or check the status of existing posts as raw data (not the visual dashboard).",
    get_post: "the user references one specific post by its ID.",
    get_post_metrics: "the user asks how a specific post performed (likes, views, engagement).",
    list_media: "the user wants a list of their uploaded media files.",
    get_media: "the user references one specific media file by ID.",
    list_labels: "the user wants their post labels/tags.",
    list_hashtag_groups: "the user wants their saved hashtag sets, or you need hashtags to add to a post.",
    create_hashtag_group: "the user wants to save a set of hashtags for reuse.",
    update_hashtag_group: "the user wants to rename a hashtag group or change its hashtags.",
    delete_hashtag_group: "the user wants to remove a saved hashtag group.",
    update_media: "the user wants to add or change an image's alt text / accessibility description.",
    list_templates: "the user wants their saved post templates, or wants to start a post from one.",
    create_template: "the user wants to save post text for reuse.",
    update_template: "the user wants to rename a template or change its text.",
    delete_template: "the user wants to remove a saved template.",
    list_calendar_notes: "the user asks what is noted on the content calendar for a period (campaigns, holidays, reminders).",
    create_calendar_note: "the user wants to pin a note, reminder or campaign marker to a calendar day without creating a post.",
    update_calendar_note: "the user wants to move, reword or recolour a calendar note.",
    delete_calendar_note: "the user wants to remove a calendar note.",
    share_post: "the user wants a link a client or colleague can open to review a post without an account.",
    unshare_post: "the user wants to stop a shared review link from working.",
    list_review_links: "the user wants to see the client review links they have created for batches of posts.",
    create_review_link: "the user wants one link a client can open to review several posts at once, e.g. a week's worth of scheduled content, instead of sharing each post separately.",
    delete_review_link: "the user wants to stop a batch review link from working. The posts it covered are unaffected.",
    list_client_connect_links: "the user wants to see the client-connect links they have created and whether each has been used yet.",
    create_client_connect_link: "the user (an agency) wants a client to connect their own platform account without giving the agency their login, and without the client needing a BulkPublish account.",
    delete_client_connect_link: "the user wants to stop a client-connect link from working before it has been used. Any account it already connected is unaffected.",
    list_schedules: "the user wants their recurring posting schedules.",
    get_analytics: "the user asks how their content performed overall, across channels and over a date range.",
    get_quota_usage: "the user asks about plan limits or current usage.",
    get_queue_slot: "the user asks when the next available scheduling slot is, or wants a post moved to the top or bottom of the queue (then update_post with the returned scheduledAt).",
    get_channel_health: "the user asks whether a channel's connection/token is healthy.",
    get_channel_options: "you need a platform's valid post types before creating a post for it.",
    search_mentions: "you need @mention suggestions from a connected channel while drafting a post.",
    create_post: "the user wants to draft or schedule one new post (do not publish immediately unless asked).",
    update_post: "the user wants to edit an existing post.",
    list_platforms: "the user asks which platforms are supported or available, or a connect/publish attempt failed with PLATFORM_DISABLED.",
    bulk_posts: "the user wants to delete, retry, or reschedule many posts in a single request.",
    upload_media: "the user provides an image/video to attach to a post.",
    create_media_upload: "you need a presigned URL for a large direct upload (advanced; prefer upload_media for normal files).",
    finalize_media_upload: "a presigned direct upload finished and the file must be registered (advanced).",
    create_multipart_upload: "a file is too large for a single upload (e.g. a video over 100MB, up to 1GB) and must be sent in 10MB chunks.",
    complete_multipart_upload: "all parts of a chunked upload are PUT and their ETags collected.",
    abort_multipart_upload: "a chunked upload should be cancelled and its stored parts freed.",
    list_channel_sets: "the user wants their saved channel groups (channel sets).",
    create_channel_set: "the user wants to save a group of channels for one-click targeting.",
    update_channel_set: "the user wants to rename a channel set or change its channels.",
    delete_channel_set: "the user wants to remove a saved channel set.",
    list_rss_feeds: "the user wants their RSS autopost feeds.",
    create_rss_feed: "the user wants new items from an RSS/Atom feed to become posts automatically.",
    update_rss_feed: "the user wants to change, pause, or re-point an RSS autopost feed.",
    delete_rss_feed: "the user wants to stop and remove an RSS autopost feed.",
    create_label: "the user wants a new label/tag.",
    update_label: "the user wants to rename or recolor a label.",
    create_schedule: "the user wants a recurring posting schedule.",
    update_schedule: "the user wants to change a recurring schedule.",
    publish_post: "the user wants to publish an existing draft or scheduled post right now.",
    retry_post: "a post failed on some platforms and the user wants to retry just those.",
    approve_post: "the user (an owner/admin/approver) wants to approve a post awaiting team approval.",
    reject_post: "the user (an owner/admin/approver) wants to reject a post awaiting team approval, optionally with a reason.",
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
    if (typeof original !== "function") {
      // The SDK's private registration seam moved. Fail loudly: shipping a
      // server with no annotations is exactly what gets a directory
      // submission rejected.
      throw new Error("McpServer._createRegisteredTool is missing — update the annotation hook for this SDK version.");
    }
    const bound = original.bind(server);
    srv._createRegisteredTool = (...args: unknown[]) => {
      const name = args[0] as string;
      const ann = TOOL_ANNOTATIONS[name];
      if (!ann) {
        // Every tool needs an entry — that is where its title, hints and the
        // review justification live. Unannotated tools do not ship.
        throw new Error(`Tool "${name}" has no TOOL_ANNOTATIONS entry.`);
      }
      if (!toolInProfile(name, profile)) {
        // Outside the active profile: skip registration entirely. Callers
        // ignore the returned handle, so a disabled stub is enough.
        return { enabled: false, disable() {}, enable() {}, update() {}, remove() {} };
      }
      if (!args[1]) args[1] = ann.title; // tool title (regular tools have none)
      // Output schema + structuredContent for the plain tools. The widgets set
      // both themselves, so only fill an empty slot. Both halves must land
      // together: the SDK fails any call where a declared outputSchema has no
      // structuredContent to validate.
      const outShape = TOOL_OUTPUT_SCHEMAS[name];
      if (outShape && !args[4]) {
        args[4] = outShape; // outputSchema slot
        const handler = args[8]; // _createRegisteredTool(..., execution, _meta, handler)
        if (typeof handler === "function") {
          const inner = handler as (...a: unknown[]) => unknown;
          args[8] = async (...cbArgs: unknown[]) =>
            attachStructured(await inner(...cbArgs), name);
        }
      }
      const { why: _why, title: _title, ...hints } = ann;
      // All four hints, explicit booleans, on every tool. Anything a call
      // site passes explicitly still wins.
      args[5] = { ...hints, ...((args[5] as object) ?? {}) }; // annotations slot
      const use = TOOL_USE_HINTS[name];
      if (use && typeof args[2] === "string" && !(args[2] as string).includes("Use this when")) {
        args[2] = (args[2] as string).replace(/\s+$/, "") + " Use this when " + use; // description slot
      }
      return bound(...args);
    };
  }

// ---------------------------------------------------------------------------
// Tool: list_channels
// ---------------------------------------------------------------------------

server.tool(
  "list_channels",
  "List all connected social media channels (X/Twitter, Instagram, LinkedIn, Facebook, TikTok, etc.). Returns channel ID, platform, account name, and token status, plus a `capabilities` object saying whether the caller may create, publish or approve posts. Check that before attempting a write rather than discovering the permission from a 403.",
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
// Tool: list_platforms
// ---------------------------------------------------------------------------

server.tool(
  "list_platforms",
  "List every social platform BulkPublish supports and whether it is currently available. " +
    "Check this before telling a user they can connect a platform or scheduling a post to one: " +
    "a platform in state 'off' rejects post creation with a 403 PLATFORM_DISABLED error and holds " +
    "any already-scheduled posts until it is re-enabled, and one in state 'connect_off' cannot accept " +
    "new connections although existing channels keep publishing. Disabled platforms are still listed, " +
    "with enabled=false and a reason. A platform may also carry a 'variants' object keyed by channel " +
    "accountType for sub-platforms gated on their own: LinkedIn reports variants.organization for " +
    "company pages (a separate LinkedIn app with its own review), while the platform-level state " +
    "covers personal profiles — so pages can be paused while personal-profile posting is live. " +
    "A variant is never more permissive than its parent, and when a variant blocks a write the 403 " +
    "PLATFORM_DISABLED error carries an accountType field naming it.",
  {},
  async () => {
    const res = await api("GET", "/api/platforms");
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
    const res = await api<{ file?: { id: number; mimeType: string } }>(
      "GET",
      `/api/media/${id}`
    );
    if (!res.ok) return { medias: [], error: `Media ID ${id} not found` };
    // The API nests the record under `file` — reading mimeType off the top level
    // made hasVideo/hasImage always false and blocked every TikTok/YouTube video post.
    const d =
      (res.data as { file?: { id: number; mimeType: string } }).file ??
      (res.data as unknown as { id: number; mimeType: string });
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
    content: z
      .string()
      .optional()
      .describe(
        "The post text content. Optional — defaults to empty for media-only posts. " +
        "LinkedIn mentions: write @[Display Name](urn:li:organization:ID) for a Page or @[Display Name](urn:li:person:ID) for a person; " +
        "search_mentions on a LinkedIn channel returns ready-made Page tokens. The token publishes as a real mention on LinkedIn and as plain @Display Name on other channels."
      ),
    channels: z
      .array(
        z.object({
          channelId: z.number().describe("Channel ID to post to."),
          platform: PLATFORM_ENUM.describe(
            "Platform name. One of the supported BulkPublish platforms."
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
    platformSpecific: PLATFORM_SPECIFIC_SCHEMA,
    platformContent: PLATFORM_CONTENT_SCHEMA,
    postFormat: z
      .enum(["post", "video", "reel", "story", "carousel", "thread"])
      .optional()
      .describe('Post format. "post" (default), "video", "reel", "story", "carousel", or "thread" for multi-part threads.'),
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
        "Thread parts array. Required when postFormat is thread (min 2 parts). EVERY part is measured against the character limit of every platform the post targets, not only the first \u2014 an over-long part is rejected with 400 VALIDATION_ERROR naming the part number, the platform and its limit. URLs count as 23 characters on X and Mastodon, their real length elsewhere."
      ),
    postTypeOverrides: POST_TYPE_OVERRIDES_SCHEMA,
    requestApproval: z
      .boolean()
      .optional()
      .describe(
        "Optional (default false). Set true to hold a scheduled post for team approval (approvalStatus becomes 'pending'). Forced on server-side for API keys of roles without post:publish (contributors), regardless of this flag."
      ),
    linkTrackingOverride: z
      .boolean()
      .nullable()
      .optional()
      .describe(
        "Optional per-post override for link tracking (bulkpubli.sh). true forces links in this post to be shortened and their clicks counted, false forces them to publish as written, and null/omitted (the default) inherits the organization's Link Tracking setting. Shortening happens at publish time, per channel, so two accounts on the same platform get distinct codes; it is skipped for a channel when the rewrite would push the post past that platform's character limit (a short URL is 28 characters and can be longer than the link it replaces)."
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
    requestApproval,
    linkTrackingOverride,
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
      content: content ?? "",
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
    if (requestApproval !== undefined) body.requestApproval = requestApproval;
    if (linkTrackingOverride !== undefined)
      body.linkTrackingOverride = linkTrackingOverride;

    const res = await api("POST", "/api/posts", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_posts
// ---------------------------------------------------------------------------

server.tool(
  "list_posts",
  "List posts with optional filters for status, search text, date range, channel, and label. Returns paginated results with platform statuses and metrics, ordered newest-first by publishedAt if the post is live, else scheduledAt, else createdAt.",
  {
    status: z
      .enum(["draft", "scheduled", "publishing", "published", "processing", "failed", "partial"])
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
    approvalStatus: z
      .enum(["none", "pending", "approved", "rejected"])
      .optional()
      .describe("Filter by team approval state (e.g. 'pending' for the approval queue)."),
    assignedTo: z
      .string()
      .optional()
      .describe(
        "Filter by who the post is assigned to: a user id, 'me' for the caller, or 'unassigned'. Orthogonal to status \u2014 a post can be scheduled AND assigned."
      ),
    order: z
      .enum(["asc", "desc"])
      .optional()
      .describe(
        "Direction of the timeline sort (published, else due, else created). 'desc' is the default and returns the most recent first. Use 'asc' to read what is coming NEXT \u2014 with a limit, 'desc' returns the posts scheduled furthest out, not the soonest."
      ),
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
    approvalStatus,
    assignedTo,
    order,
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
    if (approvalStatus) params.set("approvalStatus", approvalStatus);
    if (assignedTo) params.set("assignedTo", assignedTo);
    if (order) params.set("order", order);

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
  "Get a single post by ID with full details including platform statuses, labels, media files, recurring schedule info, and metrics. For a thread post, `threadParts` holds the parts and `threadMediaFiles` resolves the media they reference: that media is NOT in `mediaFiles`, which carries only the media on the post itself.",
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
  "Publish a draft or scheduled post immediately. The post will be queued for publishing to all its target channels. " +
    "Requires a role with post:publish — contributors get 403 APPROVAL_REQUIRED and must submit the post for approval instead (create/update with requestApproval, then a teammate approves). " +
    "Publishing a pending/rejected post as an approver implicitly approves it.",
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
  "Retry publishing a failed or partially failed post. Only retries the platforms that failed, not the ones that already succeeded. " +
    "Platforms in status 'unconfirmed' (the publish request may have reached the platform but its response was lost — the post may already be live) are NOT retried unless republish is true; " +
    "if the post has unconfirmed platforms and no failed ones, the call fails with a 400 and code UNCONFIRMED_REQUIRES_REPUBLISH — ask the user to check the account on the platform, and only pass republish: true after they confirm the post is not live.",
  {
    postId: z.number().describe("The post ID to retry."),
    republish: z
      .boolean()
      .optional()
      .describe(
        "Explicit opt-in to also retry platforms in status 'unconfirmed'. Their publish may have already gone through, so this can DUPLICATE the post — only pass true after the user has checked the account and confirmed the post is not live. Defaults to false."
      ),
  },
  async ({ postId, republish }) => {
    const res = await api("POST", `/api/posts/${postId}/retry`, republish === undefined ? undefined : { republish });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: approve_post
// ---------------------------------------------------------------------------

server.tool(
  "approve_post",
  "Approve a post awaiting team approval. Requires a role with post:approve (owner, admin, approver). " +
    "Releases a post with approvalStatus 'pending': it publishes at its scheduled time, or immediately if that time has already passed. The author is notified in-app. " +
    "Errors: 400 if the post is not awaiting approval, 403 if the role lacks post:approve, 404 if not found.",
  {
    postId: z.number().describe("The post ID to approve."),
  },
  async ({ postId }) => {
    const res = await api("POST", `/api/posts/${postId}/approve`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: reject_post
// ---------------------------------------------------------------------------

server.tool(
  "reject_post",
  "Reject a post awaiting team approval. Requires a role with post:approve. " +
    "The post returns to draft with approvalStatus 'rejected' and the optional reason; the author is notified and can edit + reschedule to resubmit for approval. " +
    "Errors: 400 if the post is not awaiting approval, 403 if the role lacks post:approve, 404 if not found.",
  {
    postId: z.number().describe("The post ID to reject."),
    reason: z
      .string()
      .max(2000)
      .optional()
      .describe("Optional reason (max 2000 chars). Shown to the author (in-app notification + on the post)."),
  },
  async ({ postId, reason }) => {
    const body: Record<string, unknown> = {};
    if (reason !== undefined) body.reason = reason;
    const res = await api("POST", `/api/posts/${postId}/reject`, body);
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
    type: z.enum(["image", "video"]).optional().describe("Filter by media kind (matches the MIME type prefix). The response's `total` counts matches across all pages."),
  },
  async ({ search, page, limit, type }) => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (page) params.set("page", String(page));
    if (limit) params.set("limit", String(limit));
    if (type) params.set("type", type);

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
  "Get an analytics summary for a date range. Returns total posts, status breakdown (published, failed, scheduled), per-platform stats, and daily post counts. Optional filters narrow every figure to matching posts; `compare` adds the equal-length previous window under `previous` (available for windows of 15 days or fewer — the 30-day statistics-retention cap applies).",
  {
    from: z.string().describe("Start date in ISO format (e.g. 2025-01-01)."),
    to: z.string().describe("End date in ISO format (e.g. 2025-01-31)."),
    channelIds: z.string().optional().describe("Comma-separated channel ids to include, e.g. \"12,15\"."),
    platforms: z.string().optional().describe("Comma-separated platform keys to include, e.g. \"x,linkedin\"."),
    labelIds: z.string().optional().describe("Comma-separated label ids; a post matches when it carries ANY of them."),
    postFormat: z.enum(["post", "thread"]).optional().describe("Only single posts or only threads."),
    mediaType: z.enum(["text", "image", "video"]).optional().describe("By the post's first media file: text (no media), image or video."),
    compare: z.boolean().optional().describe("Also return the previous equal-length window as `previous` / `previousWindow`."),
  },
  async ({ from, to, channelIds, platforms, labelIds, postFormat, mediaType, compare }) => {
    const params = new URLSearchParams({ from, to });
    if (channelIds) params.set("channelIds", channelIds);
    if (platforms) params.set("platforms", platforms);
    if (labelIds) params.set("labelIds", labelIds);
    if (postFormat) params.set("postFormat", postFormat);
    if (mediaType) params.set("mediaType", mediaType);
    if (compare) params.set("compare", "1");
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
// Tools: hashtag groups
// ---------------------------------------------------------------------------

server.tool(
  "list_hashtag_groups",
  "List the organization's saved hashtag groups — named sets of hashtags to drop into a post.",
  {},
  async () => {
    const res = await api("GET", "/api/hashtag-groups");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "create_hashtag_group",
  "Save a named set of hashtags (1-30) for reuse in posts. Hashtags may be given with or without the leading '#'; letters, digits and underscores only. Up to 100 groups per organization.",
  {
    name: z.string().max(100).describe("Group name, unique per organization."),
    hashtags: z.array(z.string()).min(1).max(30).describe("Hashtags, e.g. [\"launch\", \"#newproduct\"]."),
  },
  async ({ name, hashtags }) => {
    const res = await api("POST", "/api/hashtag-groups", { name, hashtags });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "update_hashtag_group",
  "Rename a hashtag group and/or replace its hashtags (partial update — at least one field is required).",
  {
    groupId: z.number().describe("The hashtag group ID."),
    name: z.string().max(100).optional().describe("New name."),
    hashtags: z.array(z.string()).min(1).max(30).optional().describe("Replacement hashtag list."),
  },
  async ({ groupId, name, hashtags }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (hashtags !== undefined) body.hashtags = hashtags;
    const res = await api("PUT", `/api/hashtag-groups/${groupId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "delete_hashtag_group",
  "Delete a saved hashtag group. Posts that already contain its hashtags are untouched.",
  {
    groupId: z.number().describe("The hashtag group ID to delete."),
  },
  async ({ groupId }) => {
    const res = await api("DELETE", `/api/hashtag-groups/${groupId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tools: post templates
// ---------------------------------------------------------------------------

server.tool(
  "list_templates",
  "List the organization's saved post templates — reusable text to start a new post from. Filter by kind to get saved first-comment snippets instead of captions.",
  {
    kind: z.enum(["caption", "first_comment"]).optional().describe("Which kind of saved text to list. Defaults to caption."),
  },
  async ({ kind }) => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    const qs = params.toString();
    const res = await api("GET", `/api/templates${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "create_template",
  "Save post text as a named template for reuse (text only; media and channels belong to the post). Up to 200 per organization per kind (captions and first-comment snippets each have their own 200); names are unique per kind, so a caption and a first-comment snippet can share a name.",
  {
    name: z.string().max(100).describe("Template name."),
    content: z.string().max(10000).describe("Template text."),
    kind: z.enum(["caption", "first_comment"]).optional().describe("What the text is for: a post caption, or a first-comment reply. Defaults to caption."),
  },
  async ({ name, content, kind }) => {
    const body: Record<string, unknown> = { name, content };
    if (kind !== undefined) body.kind = kind;
    const res = await api("POST", "/api/templates", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "update_template",
  "Rename a template and/or replace its text (partial update — at least one field is required).",
  {
    templateId: z.number().describe("The template ID."),
    name: z.string().max(100).optional(),
    content: z.string().max(10000).optional(),
  },
  async ({ templateId, name, content }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (content !== undefined) body.content = content;
    const res = await api("PUT", `/api/templates/${templateId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "delete_template",
  "Delete a saved post template.",
  { templateId: z.number().describe("The template ID to delete.") },
  async ({ templateId }) => {
    const res = await api("DELETE", `/api/templates/${templateId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tools: calendar notes
// ---------------------------------------------------------------------------

server.tool(
  "list_calendar_notes",
  "List calendar notes (free text pinned to a day — campaigns, holidays, 'no posts this week'; they never publish) in a date range of at most a year.",
  {
    from: z.string().describe("Start date, YYYY-MM-DD (inclusive)."),
    to: z.string().describe("End date, YYYY-MM-DD (inclusive)."),
  },
  async ({ from, to }) => {
    const res = await api("GET", `/api/calendar-notes?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "create_calendar_note",
  "Pin a note to a day on the content calendar. Not a post: nothing is published.",
  {
    date: z.string().describe("Calendar date, YYYY-MM-DD."),
    body: z.string().max(2000).describe("Note text."),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().describe("Six-digit hex colour, default #F59E0B."),
  },
  async ({ date, body, color }) => {
    const payload: Record<string, unknown> = { date, body };
    if (color) payload.color = color;
    const res = await api("POST", "/api/calendar-notes", payload);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "update_calendar_note",
  "Change a calendar note's day, text and/or colour (partial update — at least one field is required).",
  {
    noteId: z.number().describe("The note ID."),
    date: z.string().optional().describe("New date, YYYY-MM-DD."),
    body: z.string().max(2000).optional(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  },
  async ({ noteId, date, body, color }) => {
    const payload: Record<string, unknown> = {};
    if (date !== undefined) payload.date = date;
    if (body !== undefined) payload.body = body;
    if (color !== undefined) payload.color = color;
    const res = await api("PUT", `/api/calendar-notes/${noteId}`, payload);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "delete_calendar_note",
  "Delete a calendar note.",
  { noteId: z.number().describe("The note ID to delete.") },
  async ({ noteId }) => {
    const res = await api("DELETE", `/api/calendar-notes/${noteId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tools: post review links
// ---------------------------------------------------------------------------

server.tool(
  "share_post",
  "Create (or fetch) a post's read-only review link that anyone can open without signing in — for client approval outside the app. Returns { shareToken, url, created }. regenerate=true mints a new link and kills the old one. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  {
    postId: z.number().describe("The post ID."),
    regenerate: z.boolean().optional().describe("Mint a new token, invalidating the previous link."),
  },
  async ({ postId, regenerate }) => {
    const res = await api("POST", `/api/posts/${postId}/share`, regenerate ? { regenerate: true } : {});
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "unshare_post",
  "Revoke a post's review link so the URL stops working. Idempotent. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  { postId: z.number().describe("The post ID.") },
  async ({ postId }) => {
    const res = await api("DELETE", `/api/posts/${postId}/share`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tools: client review links (a batch of posts, not just one)
// ---------------------------------------------------------------------------

server.tool(
  "list_review_links",
  "List the organization's client review links (batch review links), newest first, with how many posts each one covers. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  {},
  async () => {
    const res = await api("GET", "/api/review-links");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "create_review_link",
  "Create a read-only review link covering several posts at once — the multi-post counterpart of share_post. Anyone with the link can open it without signing in. Every postId must belong to the organization. Unlike share_post this is never regenerated in place: each call mints a new link and a new token, even for the same posts. Returns { reviewLink, url }. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  {
    postIds: z.array(z.number()).min(1).max(50).describe("Post IDs to cover, up to 50 per link."),
    name: z.string().max(150).optional().describe("Optional label shown only to your team (e.g. the client's name) — never shown on the public page."),
  },
  async ({ postIds, name }) => {
    const body: Record<string, unknown> = { postIds };
    if (name !== undefined) body.name = name;
    const res = await api("POST", "/api/review-links", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "delete_review_link",
  "Revoke a client review link. The posts it covered are untouched. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  { reviewLinkId: z.number().describe("The review link ID.") },
  async ({ reviewLinkId }) => {
    const res = await api("DELETE", `/api/review-links/${reviewLinkId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tools: client connect links (account access, not content review)
// ---------------------------------------------------------------------------

const CLIENT_CONNECT_PLATFORMS = [
  "instagram", "x", "tiktok", "youtube", "threads", "pinterest",
  "gmb", "linkedin", "reddit", "discord", "tumblr", "snapchat",
] as const;

server.tool(
  "list_client_connect_links",
  "List the organization's client-connect links, newest first — one-time links a client can open, with no BulkPublish account, to connect their own platform account. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  {},
  async () => {
    const res = await api("GET", "/api/client-connect-links");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "create_client_connect_link",
  `Create a one-time link a client can open, with no BulkPublish account of their own, to connect one of their platform accounts into this organization. The client picks which platform when they open it — only these are supported (everything else needs a form of its own instead of a plain OAuth redirect, and stays a manual connect by your own team): ${CLIENT_CONNECT_PLATFORMS.join(", ")}. Expires in 7 days or the moment an account is connected through it, whichever comes first — creating again always makes a new link. Returns { clientConnectLink, url }. The url is shown only this once: it cannot be recovered later, so save it when you get it. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.`,
  {
    name: z.string().max(150).describe("Your own label for the client (e.g. \"Acme Corp\"). Never shown to the client — only applied to the resulting channel so you can tell whose account it is."),
  },
  async ({ name }) => {
    const res = await api("POST", "/api/client-connect-links", { name });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "delete_client_connect_link",
  "Revoke a client-connect link before it has been used. Idempotent; an account it already connected is untouched. Pro and Business only: on the single-seat Free and Lifetime plans this answers 403 FEATURE_DISABLED with the plan and an upgrade hint.",
  { clientConnectLinkId: z.number().describe("The client-connect link ID.") },
  async ({ clientConnectLinkId }) => {
    const res = await api("DELETE", `/api/client-connect-links/${clientConnectLinkId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_media (alt text)
// ---------------------------------------------------------------------------

server.tool(
  "update_media",
  "Set a media file's alt text (accessibility description). It belongs to the file, so one value covers every post that reuses it, and is sent to Instagram, LinkedIn and Bluesky. Pass an empty string to clear.",
  {
    mediaId: z.number().describe("The media file ID."),
    altText: z.string().max(1000).describe("Description of the image for people who cannot see it. Empty string clears it."),
  },
  async ({ mediaId, altText }) => {
    const res = await api("PATCH", `/api/media/${mediaId}`, { altText: altText || null });
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
    "Check current account usage. Returns daily/monthly post counts, scheduled post counts, channel counts, and media storage usage. " +
      "Also returns channelSlots — purchased extra channel slots ($2.99/month each, available on every plan; a seat-based subscription whose unused slots are auto-canceled before renewal): each active slot raises the effective total channel limit by one and allows one channel above the per-platform cap; per-slot autoRenews says whether it renews or lapses at expiresAt.",
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
  "Update an existing post. Can change content, schedule, media, labels, status, and platform-specific settings. " +
    "Only draft, scheduled, failed, or partial posts can be edited; editing a failed post resets it to draft, a partial post stays partial. " +
    "Set status to 'draft' or 'scheduled' to move the post between those states — scheduling a partial post re-queues only its failed channels; use publish_post to publish immediately.",
  {
    postId: z.number().describe("The post ID to update."),
    content: z.string().optional().describe("New post text content."),
    status: z
      .enum(["draft", "scheduled"])
      .optional()
      .describe(
        "Move the post between draft and scheduled. 'scheduled' requires a future scheduledAt (in this call or already stored) and at least one channel; 'draft' unschedules it. Any other value is rejected. Omit to leave the status unchanged. To publish immediately, use publish_post instead."
      ),
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
    postTypeOverrides: POST_TYPE_OVERRIDES_SCHEMA,
    platformSpecific: PLATFORM_SPECIFIC_SCHEMA,
    requestApproval: z
      .boolean()
      .optional()
      .describe(
        "Optional (default false). Set true to hold a scheduled post for team approval (approvalStatus becomes 'pending'). Forced on server-side for API keys of roles without post:publish (contributors), regardless of this flag."
      ),
    linkTrackingOverride: z
      .boolean()
      .nullable()
      .optional()
      .describe(
        "Optional per-post override for link tracking (bulkpubli.sh). true forces links in this post to be shortened and their clicks counted, false forces them to publish as written, and null clears the override so the post inherits the organization's Link Tracking setting again. Omit to leave it unchanged."
      ),
    ifUnmodifiedSince: z
      .string()
      .optional()
      .describe(
        "Optional precondition: the post's updatedAt exactly as the last read returned it. The update is refused with 409 CONFLICT if a teammate has changed the post since, rather than overwriting their version. Pass it whenever you read a post before editing it; omit it to keep the previous last-write-wins behaviour."
      ),
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
    requestApproval,
    linkTrackingOverride,
    ifUnmodifiedSince,
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
    if (requestApproval !== undefined) body.requestApproval = requestApproval;
    if (linkTrackingOverride !== undefined)
      body.linkTrackingOverride = linkTrackingOverride;
    if (ifUnmodifiedSince !== undefined) body.ifUnmodifiedSince = ifUnmodifiedSince;

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
  "Get engagement metrics for a published post. Returns likes, comments, shares, impressions, and other platform-specific metrics. IMPORTANT: every platform entry carries `metricsSupported` and `supportedMetrics` — a metric key NOT in `supportedMetrics` is stored as 0 because that platform's API has no such field, so report it as unavailable rather than as zero. X reports impressions/likes/comments/shares/saves (bookmarks); Bluesky and Mastodon report no impressions; Pinterest reports no reach; YouTube reports no shares or reach; Reddit reports likes (score), comments and shares (crossposts); Discord reports likes (reaction counts) and comments (thread replies); Google Business, Telegram, Tumblr and LinkedIn personal profiles report nothing readable at all. Each platform entry also carries `linkClicks` (summed in `totals.linkClicks`): clicks on bulkpubli.sh short links in this post, measured by BulkPublish rather than reported by the platform. It sits OUTSIDE `latest` and is distinct from the platform's own `clicks` — one visit can register in both, so never add them together. It is therefore available even for the platforms that report nothing, and `supportedMetrics` always includes it. Bot and link-preview traffic is excluded; it is 0 for organizations without Link Tracking enabled.",
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
  "Perform a bulk action on multiple posts. Supports deleting, retrying, or rescheduling multiple posts at once.",
  {
    action: z
      .enum(["delete", "retry", "reschedule"])
      .describe('Bulk action: "delete", "retry", or "reschedule".'),
    postIds: z
      .array(z.number())
      .describe("Array of post IDs to perform the action on."),
    scheduledAt: z
      .string()
      .optional()
      .describe('New ISO 8601 datetime. Required when action is "reschedule".'),
  },
  async ({ action, postIds, scheduledAt }) => {
    const body: Record<string, unknown> = { action, postIds };
    if (scheduledAt !== undefined) body.scheduledAt = scheduledAt;
    const res = await api("POST", "/api/posts/bulk", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: get_queue_slot
// ---------------------------------------------------------------------------

server.tool(
  "get_queue_slot",
  "Get the organization's next available queue slot. Useful for finding the next optimal scheduling time.",
  {
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone for the slot calculation (e.g. "America/New_York"). Defaults to UTC.'),
    position: z
      .enum(["next", "end"])
      .optional()
      .describe('"next" (default): the next free slot. "end": the slot after the last pending scheduled post, i.e. the bottom of the queue.'),
    excludePostId: z
      .number()
      .optional()
      .describe("When the slot is for rescheduling an existing post, its ID — so its current slot is not counted as booked."),
  },
  async ({ timezone, position, excludePostId }) => {
    const params = new URLSearchParams();
    if (timezone) params.set("timezone", timezone);
    if (position) params.set("position", position);
    if (excludePostId !== undefined) params.set("excludePostId", String(excludePostId));
    const qs = params.toString();
    const res = await api("GET", `/api/posts/queue-slot${qs ? `?${qs}` : ""}`);
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
  "Get platform-specific options for a channel: Pinterest boards, YouTube playlists, Tumblr blogs, Discord text channels, Reddit subreddit search or flairs, Threads location search.",
  {
    channelId: z.number().describe("The channel ID to get options for."),
    q: z
      .string()
      .optional()
      .describe("Search term. Reddit: subreddit name search. Threads: place search for platformSpecific.threads.locationId (returns { unavailable: true } until the channel has granted location tagging)."),
    subreddit: z.string().optional().describe("Reddit only: return that subreddit's post flairs instead of searching."),
  },
  async ({ channelId, q, subreddit }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (subreddit) params.set("subreddit", subreddit);
    const qs = params.toString();
    const res = await api("GET", `/api/channels/${channelId}/options${qs ? `?${qs}` : ""}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: search_mentions
// ---------------------------------------------------------------------------

server.tool(
  "search_mentions",
  "Search for @mention suggestions on a channel (X, Bluesky, LinkedIn). On LinkedIn the query is a Page's URL slug (exact match), each result's handle is a ready-to-paste @[Name](urn:li:organization:ID) token, and vanityName is the slug it matched — check it against the Page you meant before using the token, since a display name alone is ambiguous.",
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
  "List all recurring post schedules. Returns schedule name, frequency/timeOfDay timing fields, target channels, active status, and nextRunAt. These schedules also appear in the web app: managed on the Repeat Posts page, with upcoming runs shown on the Calendar.",
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
  "Create a new recurring post schedule. Posts are automatically created and published on the chosen frequency. The schedule is visible in the web app (Repeat Posts page, with upcoming runs on the Calendar); a post record exists only once an occurrence fires, carrying recurringScheduleId.",
  {
    name: z.string().describe("Schedule name."),
    channelIds: z
      .array(z.number())
      .describe("Array of channel IDs to post to."),
    frequency: z
      .enum(["daily", "weekly", "biweekly", "monthly"])
      .describe("How often the schedule runs."),
    timeOfDay: z
      .string()
      .describe('Time of day to post, 24h "HH:MM" (e.g. "09:00").'),
    dayOfWeek: z
      .number()
      .min(0)
      .max(6)
      .optional()
      .describe("Day of week (0=Sunday..6=Saturday). Required for weekly/biweekly."),
    dayOfMonth: z
      .number()
      .min(1)
      .max(31)
      .optional()
      .describe("Day of month (1-31). Required for monthly."),
    contentTemplate: z
      .string()
      .optional()
      .describe("Post content template. Defaults to empty."),
    mediaFileIds: z
      .array(z.number())
      .optional()
      .describe("Media file IDs re-used for every generated post."),
    timezone: z
      .string()
      .optional()
      .describe('IANA timezone (e.g. "America/New_York"). Defaults to UTC.'),
    isActive: z
      .boolean()
      .optional()
      .describe("Whether the schedule starts active. Defaults to true."),
    requireApproval: z
      .boolean()
      .optional()
      .describe(
        "Hold every occurrence this schedule generates for team approval — each generated post lands with approvalStatus 'pending' and the scheduler skips it until an approver releases it via approve_post. Defaults to false. Forced to true for API keys whose role cannot publish (contributors), regardless of what is sent here and on every update, so reporting it as off would be wrong."
      ),
  },
  async ({ name, channelIds, frequency, timeOfDay, dayOfWeek, dayOfMonth, contentTemplate, mediaFileIds, timezone, isActive, requireApproval }) => {
    const body: Record<string, unknown> = {
      name,
      channelIds,
      frequency,
      timeOfDay,
    };
    if (dayOfWeek !== undefined) body.dayOfWeek = dayOfWeek;
    if (dayOfMonth !== undefined) body.dayOfMonth = dayOfMonth;
    if (contentTemplate !== undefined) body.contentTemplate = contentTemplate;
    if (mediaFileIds !== undefined) body.mediaFileIds = mediaFileIds;
    if (timezone) body.timezone = timezone;
    if (isActive !== undefined) body.isActive = isActive;
    if (requireApproval !== undefined) body.requireApproval = requireApproval;
    const res = await api("POST", "/api/schedules", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_schedule
// ---------------------------------------------------------------------------

server.tool(
  "update_schedule",
  "Update an existing recurring schedule. Can change name, content template, frequency/timing, timezone, media, or active status. The next run time is recomputed by the server when timing changes.",
  {
    scheduleId: z.number().describe("The schedule ID to update."),
    name: z.string().optional().describe("New schedule name."),
    contentTemplate: z.string().optional().describe("New post content template."),
    frequency: z
      .enum(["daily", "weekly", "biweekly", "monthly"])
      .optional()
      .describe("New frequency."),
    timeOfDay: z.string().optional().describe('New time of day, 24h "HH:MM".'),
    dayOfWeek: z
      .number()
      .min(0)
      .max(6)
      .optional()
      .describe("New day of week (0=Sunday..6=Saturday) for weekly/biweekly."),
    dayOfMonth: z
      .number()
      .min(1)
      .max(31)
      .optional()
      .describe("New day of month (1-31) for monthly."),
    mediaFileIds: z
      .array(z.number())
      .optional()
      .describe("Replace the media file IDs used for generated posts."),
    timezone: z.string().optional().describe("New IANA timezone."),
    isActive: z
      .boolean()
      .optional()
      .describe("Enable or disable the schedule."),
    requireApproval: z
      .boolean()
      .optional()
      .describe(
        "Hold every future occurrence this schedule generates for team approval — each generated post lands with approvalStatus 'pending' and the scheduler skips it until an approver releases it via approve_post. Defaults to false. Forced to true for API keys whose role cannot publish (contributors), regardless of what is sent here and on every update, so reporting it as off would be wrong."
      ),
  },
  async ({ scheduleId, name, contentTemplate, frequency, timeOfDay, dayOfWeek, dayOfMonth, mediaFileIds, timezone, isActive, requireApproval }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (contentTemplate !== undefined) body.contentTemplate = contentTemplate;
    if (frequency !== undefined) body.frequency = frequency;
    if (timeOfDay !== undefined) body.timeOfDay = timeOfDay;
    if (dayOfWeek !== undefined) body.dayOfWeek = dayOfWeek;
    if (dayOfMonth !== undefined) body.dayOfMonth = dayOfMonth;
    if (mediaFileIds !== undefined) body.mediaFileIds = mediaFileIds;
    if (timezone !== undefined) body.timezone = timezone;
    if (isActive !== undefined) body.isActive = isActive;
    if (requireApproval !== undefined) body.requireApproval = requireApproval;
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
// Tool: list_channel_sets
// ---------------------------------------------------------------------------

server.tool(
  "list_channel_sets",
  "List saved channel sets — named channel groupings for one-click multi-channel targeting. Returns id, name, and channelIds for each set, ordered by name.",
  {},
  async () => {
    const res = await api("GET", "/api/channel-sets");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: create_channel_set
// ---------------------------------------------------------------------------

server.tool(
  "create_channel_set",
  "Create a channel set — a saved channel grouping for one-click multi-channel targeting. Names are unique per organization (a duplicate fails with a 409, code DUPLICATE_NAME); an organization can have up to 50 sets.",
  {
    name: z.string().max(100).describe("Set name (max 100 chars, unique per organization)."),
    channelIds: z
      .array(z.number())
      .min(1)
      .describe("IDs of channels in your organization (at least 1)."),
  },
  async ({ name, channelIds }) => {
    const res = await api("POST", "/api/channel-sets", { name, channelIds });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_channel_set
// ---------------------------------------------------------------------------

server.tool(
  "update_channel_set",
  "Update a channel set's name and/or channels (partial update — at least one field is required). A name that collides with another set fails with a 409, code DUPLICATE_NAME.",
  {
    setId: z.number().describe("The channel set ID to update."),
    name: z.string().max(100).optional().describe("New set name (max 100 chars, unique per organization)."),
    channelIds: z
      .array(z.number())
      .min(1)
      .optional()
      .describe("Replacement channel IDs (at least 1)."),
  },
  async ({ setId, name, channelIds }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (channelIds !== undefined) body.channelIds = channelIds;
    const res = await api("PUT", `/api/channel-sets/${setId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_channel_set
// ---------------------------------------------------------------------------

server.tool(
  "delete_channel_set",
  "Delete a channel set by ID. Does not affect the channels themselves.",
  {
    setId: z.number().describe("The channel set ID to delete."),
  },
  async ({ setId }) => {
    const res = await api("DELETE", `/api/channel-sets/${setId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: list_rss_feeds
// ---------------------------------------------------------------------------

server.tool(
  "list_rss_feeds",
  "List RSS autopost feeds — RSS/Atom feeds polled every 15 minutes whose new items automatically become posts. Returns name, feedUrl, channelIds, mode, fieldMapping (how items are rendered into posts; null = default), enabled, lastCheckedAt, and lastError for each feed.",
  {},
  async () => {
    const res = await api("GET", "/api/rss-feeds");
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: create_rss_feed
// ---------------------------------------------------------------------------

// How an RSS item becomes post content (rss_feeds.fieldMapping). Omitted/null
// = the built-in default: template "{title}\n\n{link}", no media, stripHtml
// true, smart truncation.
const rssFieldMappingSchema = z
  .object({
    template: z
      .string()
      .max(2000)
      .describe(
        'Caption template (default "{title}\\n\\n{link}"). Standard tokens: {title} {link} {description} {content} {author} {categories} {feedName}. Any extra leaf field on the feed item also works as {fieldName} (lowercased localName). A line whose tokens all render empty is dropped.'
      ),
    mediaField: z
      .enum(["none", "image", "video", "auto"])
      .optional()
      .describe(
        "Which item enclosure to import and attach: none (default), image, video, or auto (video if present, else image). The file is re-hosted to the media library."
      ),
    articleImage: z
      .enum(["when_needed", "always", "never"])
      .optional()
      .describe(
        "Where to get a picture when the item has no usable enclosure. when_needed (default) takes one from the article the item links to, but only when a channel on the feed is on a platform that cannot publish without an image; always takes one whenever the item has none; never leaves those items without media. Candidates in order: the article's share image, a picture embedded in the item, then the largest pictures on the page; the first that imports cleanly and measures at least 200x200 wins, at most four are tried. Post-level like mediaField, so the picture reaches every channel of the feed. Image-required channels (Instagram, Pinterest, Snapchat) are skipped only when this finds nothing too; the video-only platforms (TikTok, YouTube) are always skipped for items with no video."
      ),
    stripHtml: z
      .boolean()
      .optional()
      .describe("Strip HTML tags/entities from item text. Default true."),
    truncate: z
      .enum(["smart", "hard", "skip"])
      .optional()
      .describe(
        "When rendered text exceeds the platform char limit: smart (default) trims at a word boundary keeping a trailing link line; hard cuts at the limit; skip drops that channel for the item."
      ),
    hashtags: z.string().max(500).optional().describe("Appended after the rendered template."),
    channelOverrides: z
      .record(
        z.string(),
        z.object({
          template: z.string().max(2000).optional(),
          hashtags: z.string().max(500).optional(),
          stripHtml: z.boolean().optional(),
          truncate: z.enum(["smart", "hard", "skip"]).optional(),
        })
      )
      .optional()
      .describe(
        "Per-channel text overrides keyed by channel id (as a string). Media selection cannot be overridden per channel; channels on the same platform share one rendered text."
      ),
  })
  .describe("Field mapping controlling how each feed item becomes a post.");

server.tool(
  "create_rss_feed",
  "Add an RSS autopost feed. The feed is polled every 15 minutes and new items become posts on the chosen channels. The server validates that feedUrl is a reachable public RSS 2.0 or Atom feed. An organization can have up to 20 feeds.",
  {
    name: z.string().max(100).describe("Feed name (max 100 chars)."),
    feedUrl: z.string().describe("Public RSS 2.0 or Atom feed URL."),
    channelIds: z
      .array(z.number())
      .min(1)
      .describe("IDs of channels new items are posted to (at least 1)."),
    mode: z
      .enum(["draft", "publish"])
      .optional()
      .describe(
        "draft = new items become draft posts for review (the default); publish = auto-published."
      ),
    fieldMapping: rssFieldMappingSchema.optional(),
    requireApproval: z
      .boolean()
      .optional()
      .describe(
        "Hold items auto-published from this feed for team approval — each generated post lands with approvalStatus 'pending' and waits for approve_post. Only meaningful when mode is 'publish' (draft items never publish on their own, and a feed force-demoted to draft by the plan gate stays ungated). Defaults to false. Forced to true for API keys whose role cannot publish (contributors), regardless of what is sent here and on every update, so reporting it as off would be wrong."
      ),
  },
  async ({ name, feedUrl, channelIds, mode, fieldMapping, requireApproval }) => {
    const body: Record<string, unknown> = { name, feedUrl, channelIds };
    if (mode !== undefined) body.mode = mode;
    if (fieldMapping !== undefined) body.fieldMapping = fieldMapping;
    if (requireApproval !== undefined) body.requireApproval = requireApproval;
    const res = await api("POST", "/api/rss-feeds", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: update_rss_feed
// ---------------------------------------------------------------------------

server.tool(
  "update_rss_feed",
  "Update an RSS autopost feed (partial update). Note: changing feedUrl re-baselines the feed — its check state resets and only items published after the change are posted, so the new feed's backlog is not flooded.",
  {
    feedId: z.number().describe("The RSS feed ID to update."),
    name: z.string().max(100).optional().describe("New feed name."),
    feedUrl: z
      .string()
      .optional()
      .describe(
        "New feed URL. Changing it re-baselines the feed (only items newer than the change are posted)."
      ),
    channelIds: z
      .array(z.number())
      .min(1)
      .optional()
      .describe("Replacement channel IDs (at least 1)."),
    mode: z
      .enum(["draft", "publish"])
      .optional()
      .describe("draft = new items become drafts for review; publish = auto-published."),
    fieldMapping: rssFieldMappingSchema
      .nullable()
      .optional()
      .describe("New field mapping; pass null to clear back to the built-in default."),
    enabled: z.boolean().optional().describe("Enable or disable polling of this feed."),
    requireApproval: z
      .boolean()
      .optional()
      .describe(
        "Hold items auto-published from this feed for team approval — each generated post lands with approvalStatus 'pending' and waits for approve_post. Only meaningful when mode is 'publish' (draft items never publish on their own, and a feed force-demoted to draft by the plan gate stays ungated). Defaults to false. Forced to true for API keys whose role cannot publish (contributors), regardless of what is sent here and on every update, so reporting it as off would be wrong."
      ),
  },
  async ({ feedId, name, feedUrl, channelIds, mode, fieldMapping, enabled, requireApproval }) => {
    const body: Record<string, unknown> = {};
    if (name !== undefined) body.name = name;
    if (feedUrl !== undefined) body.feedUrl = feedUrl;
    if (channelIds !== undefined) body.channelIds = channelIds;
    if (mode !== undefined) body.mode = mode;
    if (fieldMapping !== undefined) body.fieldMapping = fieldMapping;
    if (enabled !== undefined) body.enabled = enabled;
    if (requireApproval !== undefined) body.requireApproval = requireApproval;
    const res = await api("PUT", `/api/rss-feeds/${feedId}`, body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tool: delete_rss_feed
// ---------------------------------------------------------------------------

server.tool(
  "delete_rss_feed",
  "Delete an RSS autopost feed by ID. Stops polling; already-created posts are kept.",
  {
    feedId: z.number().describe("The RSS feed ID to delete."),
  },
  async ({ feedId }) => {
    const res = await api("DELETE", `/api/rss-feeds/${feedId}`);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

// ---------------------------------------------------------------------------
// Tools: media multipart upload (chunked direct-to-storage, videos up to 1GB)
//
// Three-step flow complementing create_media_upload/finalize_media_upload
// (which are single-PUT): create returns one presigned PUT URL per fixed 10MB
// part; the caller PUTs each slice and collects the ETag response header of
// every part (a failed part can be retried alone — a network drop never
// restarts the whole file); complete assembles + verifies and records the
// media file; abort cancels and frees stored parts.
// ---------------------------------------------------------------------------

server.tool(
  "create_multipart_upload",
  "Start a chunked (multipart) direct-to-storage upload for large media — videos up to 1GB, images up to 100MB. Returns r2Key, uploadId, the fixed partSize (10485760 bytes = 10MB), and one presigned PUT URL per part (valid 3600s). PUT each 10MB slice to its URL, collect each response's ETag header, then call complete_multipart_upload. For ordinary files prefer upload_media.",
  {
    contentType: z
      .string()
      .describe("File MIME type, e.g. video/mp4 or image/png."),
    sizeBytes: z
      .number()
      .describe("Exact file size in bytes. Videos up to 1GB; images up to 100MB."),
  },
  async ({ contentType, sizeBytes }) => {
    const res = await api("POST", "/api/media/multipart/create", {
      contentType,
      sizeBytes,
    });
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "complete_multipart_upload",
  "Complete a chunked upload: the server assembles the uploaded parts, verifies the stored object (existence, size, magic bytes, storage quota) and records the media file — same verification and response shape as finalize_media_upload. A failed assembly automatically aborts the upload.",
  {
    r2Key: z.string().describe("The r2Key returned by create_multipart_upload."),
    uploadId: z.string().describe("The uploadId returned by create_multipart_upload."),
    parts: z
      .array(
        z.object({
          partNumber: z.number().min(1).describe("1-based part number."),
          etag: z.string().describe("ETag response header from the part PUT."),
        })
      )
      .min(1)
      .describe("Every uploaded part with its ETag."),
    fileName: z.string().describe("Original file name."),
    mimeType: z.string().describe("File MIME type."),
    sizeBytes: z.number().describe("File size in bytes."),
    width: z.number().optional().describe("Pixel width (images/video)."),
    height: z.number().optional().describe("Pixel height (images/video)."),
    duration: z.number().optional().describe("Duration in seconds (video)."),
  },
  async ({ r2Key, uploadId, parts, fileName, mimeType, sizeBytes, width, height, duration }) => {
    const body: Record<string, unknown> = {
      r2Key,
      uploadId,
      parts,
      fileName,
      mimeType,
      sizeBytes,
    };
    if (width !== undefined) body.width = width;
    if (height !== undefined) body.height = height;
    if (duration !== undefined) body.duration = duration;
    const res = await api("POST", "/api/media/multipart/complete", body);
    return { content: [{ type: "text" as const, text: formatResponse(res) }] };
  }
);

server.tool(
  "abort_multipart_upload",
  "Abort an in-progress chunked upload and permanently free its stored parts. Use only when the upload should be cancelled; do not use this after all parts have been uploaded if you intend to complete the upload. This action cannot be undone.",
  {
    r2Key: z.string().describe("The r2Key returned by create_multipart_upload."),
    uploadId: z.string().describe("The uploadId returned by create_multipart_upload."),
  },
  async ({ r2Key, uploadId }) => {
    const res = await api("POST", "/api/media/multipart/abort", { r2Key, uploadId });
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
  if (!toolInProfile(config.tool, profile)) return; // resource + tool both stay out
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
  // ChatGPT's compatibility key takes the SAME domain lists under snake_case
  // field names (connect_domains / resource_domains); the MCP Apps standard
  // `ui.csp` takes camelCase. Handing ChatGPT the camelCase object leaves it
  // with no recognized list, and directory tool-scanning rejects it with
  // "openai/widgetCSP must contain at least one CSP or redirect domain list".
  // Derive it from `csp` so the two can never drift apart.
  const openaiCsp = {
    connect_domains: csp.connectDomains,
    resource_domains: csp.resourceDomains,
  };
  const meta = {
    ui: { csp },
    "openai/widgetDomain": "bulkpublish.com",
    "openai/widgetCSP": openaiCsp,
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
  return createServer({ profile: resolveToolProfile("full") });
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

  const server = createServer({ profile: resolveToolProfile("full") });
  const transport = new StdioServerTransport();
  server.connect(transport).catch((err) => {
    console.error("Failed to start MCP server:", err);
    process.exit(1);
  });
}
