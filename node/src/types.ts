// ============================================================
// BulkPublish SDK — TypeScript Type Definitions
// ============================================================

// ---------- Enums ----------

/** Supported social media platforms. */
export type Platform =
  | 'facebook'
  | 'instagram'
  | 'x'
  | 'tiktok'
  | 'youtube'
  | 'threads'
  | 'bluesky'
  | 'pinterest'
  | 'gmb'
  | 'linkedin'
  | 'mastodon'
  | 'reddit'
  | 'discord'
  | 'telegram'
  | 'tumblr';

/**
 * Availability of a platform, controlled server-side.
 *
 * - `on` — fully available.
 * - `connect_off` — new channels cannot be connected, but channels already
 *   connected keep publishing (used while a platform app review is pending).
 * - `off` — kill switch: posts targeting the platform are **held**, not failed,
 *   and publish automatically once it is re-enabled.
 */
export type PlatformState = 'on' | 'connect_off' | 'off';

/** Why a platform is in its current state. */
export type PlatformStateReason =
  | 'enabled'
  | 'flag_connect_off'
  | 'flag_off'
  /** The server has no OAuth app credentials for this platform yet. */
  | 'unconfigured';

/**
 * Availability of one social platform. Disabled platforms are always included in
 * responses with `enabled: false` — never omitted — so clients can distinguish
 * "switched off right now" from "not supported".
 */
export interface PlatformAvailability {
  platform: Platform;
  displayName: string;
  /** Brand colour hex, for UI rendering. */
  color: string | null;
  /** Convenience flag; equivalent to `state === 'on'`. */
  enabled: boolean;
  state: PlatformState;
  reason: PlatformStateReason;
  /** Whether a NEW channel can be connected right now. */
  canConnect: boolean;
  /** Whether already-connected channels can publish right now. */
  canPublish: boolean;
  /** User-facing explanation. `null` when the platform is fully enabled. */
  message: string | null;
  /** Server env var controlling this platform. Only returned to org owners/admins. */
  envVar?: string;
  /**
   * Sub-platforms gated independently of their parent, keyed by the channel
   * `accountType` they cover. Present only for platforms that have one — today
   * `linkedin.organization` (company pages), which run on a separate LinkedIn
   * app reviewed separately from personal profiles, so pages can be paused
   * while personal-profile posting stays live.
   *
   * A variant is never more permissive than its parent: a platform in state
   * `off` means every variant is off too. When a variant blocks a write, the
   * 403 `PLATFORM_DISABLED` error carries an `accountType` naming it.
   */
  variants?: Record<string, PlatformVariantAvailability>;
}

/** Availability of one sub-platform variant (e.g. LinkedIn company pages). */
export interface PlatformVariantAvailability {
  /** User-facing name, e.g. "LinkedIn Company Pages". */
  label: string;
  /** Convenience flag; equivalent to `state === 'on'`. */
  enabled: boolean;
  state: PlatformState;
  reason: PlatformStateReason;
  /** Whether a NEW channel of this account type can be connected right now. */
  canConnect: boolean;
  /** Whether already-connected channels of this account type can publish right now. */
  canPublish: boolean;
  /** User-facing explanation. `null` when the variant is fully enabled. */
  message: string | null;
  /** Server env var controlling this variant. Only returned to org owners/admins. */
  envVar?: string;
}

/** Response from listing platforms. */
export interface ListPlatformsResponse {
  platforms: PlatformAvailability[];
}

/** Supported post formats. */
export type PostFormat = 'post' | 'video' | 'reel' | 'story' | 'carousel' | 'thread';

/** Possible post statuses. */
export type PostStatus =
  | 'draft'
  | 'scheduled'
  | 'publishing'
  | 'published'
  /** All platform entries are published or still processing asynchronously (e.g. TikTok/Instagram video). */
  | 'processing'
  | 'failed'
  | 'partial';

/**
 * Team approval state of a post, orthogonal to {@link PostStatus}.
 * 'pending' and 'rejected' posts are skipped by the scheduler even when
 * scheduled and overdue; approving releases them (an overdue post publishes
 * immediately on approval).
 */
export type PostApprovalStatus = 'none' | 'pending' | 'approved' | 'rejected';

/** Possible per-platform statuses on a post. */
export type PlatformStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'processing';

/** Token health status for a channel. */
export type TokenStatus = 'valid' | 'expiring_soon' | 'expired';

/** Recurring schedule frequency. */
export type RecurringFrequency = 'daily' | 'weekly' | 'biweekly' | 'monthly';

/** Notification types. */
export type NotificationType =
  | 'post_published'
  | 'post_failed'
  | 'post_scheduled_reminder'
  | 'token_expiring'
  | 'token_expired'
  | 'daily_digest'
  | 'system';

/** Label type — either for posts or media. */
export type LabelType = 'post' | 'media';

/** Bulk action types for posts. */
export type BulkAction = 'delete' | 'retry' | 'reschedule';

// ---------- Client Options ----------

/** Configuration for the BulkPublish client. */
export interface BulkPublishOptions {
  /** Your API key (starts with `bp_`). */
  apiKey: string;
  /** Override the base URL (default: `https://app.bulkpublish.com`). */
  baseUrl?: string;
  /** Request timeout in milliseconds (default: 30000). */
  timeout?: number;
}

// ---------- Pagination ----------

/** Standard pagination parameters accepted by list endpoints. */
export interface PaginationParams {
  /** Page number (1-based). Default: 1. */
  page?: number;
  /** Items per page. Default: 20. */
  limit?: number;
}

/** Pagination metadata returned by list endpoints. */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------- API Error ----------

/** Structured error returned by the API. */
export interface ApiError {
  message: string;
  code?: string;
  hint?: string;
}

// ---------- Media ----------

/** A media file reference as returned by the API. */
export interface MediaFile {
  id: number;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  isOriginalDeleted?: boolean;
  originalUrl: string;
  /** 160x160 square crop (webp). For videos, from an extracted poster frame. */
  thumbnailUrl: string | null;
  /** 400px-wide derivative (webp) for grids. For videos, from the poster frame. */
  previewUrl?: string | null;
  /**
   * 1200px-wide derivative (webp) for lightboxes and large preview panes. For
   * videos, generated from the poster frame. Null on media uploaded before this
   * derivative existed, until the backfill runs.
   */
  largeUrl?: string | null;
  createdAt: string;
  labels?: MediaLabel[];
}

/** A label attached to a media file. */
export interface MediaLabel {
  id: number;
  name: string;
  color: string;
}

/** Parameters for listing media files. */
export interface ListMediaParams extends PaginationParams {
  /** Search by file name. */
  search?: string;
  /** Comma-separated label IDs to filter by. */
  labelIds?: string;
}

/** Response from listing media files. */
export interface ListMediaResponse {
  files: MediaFile[];
  page: number;
  limit: number;
}

/** Response from uploading a media file. */
export interface UploadMediaResponse {
  file: MediaFile;
}

/** Response from getting a single media file. */
export interface GetMediaResponse {
  file: MediaFile;
}

// ---------- Channels ----------

/** A connected social media channel/account. */
export interface Channel {
  id: number;
  platform: Platform;
  accountName: string;
  accountId: string;
  accountType: string | null;
  profileImage: string | null;
  isActive: boolean | null;
  tokenStatus: TokenStatus;
  tokenExpiresAt: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  /**
   * Whether this channel can publish right now. `false` means it is disabled
   * server-side — the channel itself is healthy, but its scheduled posts are
   * being held until it is re-enabled.
   *
   * Resolved for THIS channel: the platform flag narrowed by any variant
   * matching its `accountType`. LinkedIn company pages
   * (`accountType: 'organization'`) are gated separately from personal
   * profiles, so two LinkedIn channels in one response can differ here.
   */
  platformAvailable?: boolean;
  /** Current availability of this channel, variant included (see `platformAvailable`). */
  platformState?: PlatformState;
  /** User-facing explanation when the platform is not fully available. */
  platformMessage?: string | null;
}

/** Response from listing channels. */
export interface ListChannelsResponse {
  channels: Channel[];
}

/** Parameters for listing channels. */
export interface ListChannelsParams {
  /** Set to `false` to include inactive channels. Default: true (active only). */
  active?: boolean;
}

/** Response from getting a single channel. */
export interface GetChannelResponse {
  channel: Channel;
}

/** Response from a channel health check. */
export interface ChannelHealthResponse {
  healthy: boolean;
  tokenStatus: TokenStatus | 'error';
  message?: string;
}

/** Response from deleting a channel. */
export interface DeleteChannelResponse {
  success: boolean;
  deletedId: number;
}

// ---------- Posts ----------

/** A channel target for a post. */
export interface PostChannelEntry {
  channelId: number;
  platform: Platform;
}

/** A thread part for multi-part thread posts. */
export interface ThreadPart {
  content: string;
  mediaFileIds?: number[];
}

/** A per-platform record of a published post. */
export interface PostPlatform {
  id: number;
  postId: number;
  channelId: number;
  platform: Platform;
  status: PlatformStatus;
  platformPostId: string | null;
  platformUrl: string | null;
  threadPostIds: ThreadPostRecord[] | null;
  errorMessage: string | null;
  retryCount: number | null;
  maxRetries: number | null;
  publishedAt: string | null;
  createdAt: string;
}

/** A record of a single post within a thread. */
export interface ThreadPostRecord {
  sequence: number;
  postId: string;
  url: string;
  parentId?: string;
}

/** Repeat/recurring schedule configuration when creating a post. */
export interface RepeatScheduleConfig {
  frequency: RecurringFrequency;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  timeOfDay?: string;
  timezone?: string;
}

/** A label attached to a post. */
export interface Label {
  id: number;
  userId: string;
  organizationId: number;
  name: string;
  color: string;
  type: string;
  createdAt: string;
}

/** Inline metrics summary for a post in list view. */
export interface PostMetricsSummary {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
}

/** Recurring schedule info embedded in a post. */
export interface PostRecurringSchedule {
  id?: number;
  name?: string;
  frequency: string;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string | null;
  nextRunAt: string | null;
  isActive: boolean | null;
  channelIds?: number[];
  mediaFileIds?: number[];
  contentTemplate?: string;
  postTypeOverrides?: Record<string, string>;
  platformSpecific?: Record<string, Record<string, unknown>>;
}

/** A post as returned by the API. */
export interface Post {
  id: number;
  userId: string;
  organizationId: number;
  content: string;
  platformContent: Record<string, string>;
  mediaFiles: MediaFile[] | number[];
  status: PostStatus | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  timezone: string | null;
  postFormat: string | null;
  postTypeOverrides: Record<string, string>;
  platformSpecific: Record<string, Record<string, unknown>>;
  threadParts: ThreadPart[] | null;
  platformThreadParts: Record<string, ThreadPart[]>;
  recurringScheduleId: number | null;
  deleteMediaAfterPublish: boolean | null;
  autoPlugEnabled: boolean | null;
  autoPlugText: string | null;
  autoPlugThreshold: number | null;
  autoPlugFired: boolean | null;
  autoRepostEnabled: boolean | null;
  autoRepostThreshold: number | null;
  autoRepostFired: boolean | null;
  /**
   * Per-post override for link tracking (bulkpubli.sh). `true` forces links in
   * this post to be shortened and their clicks counted, `false` forces them to
   * publish as written, and `null` (the default) inherits the organization's
   * Link Tracking setting.
   */
  linkTrackingOverride: boolean | null;
  /**
   * Team approval state, orthogonal to status. 'pending' and 'rejected' posts
   * are skipped by the scheduler even when scheduled and overdue. Members whose
   * role lacks post:publish (contributors) always get 'pending' when
   * scheduling; others can opt in with `requestApproval`. Default: 'none'.
   */
  approvalStatus: PostApprovalStatus;
  /** User ID of the approver (set when approvalStatus is 'approved'). */
  approvedBy: string | null;
  approvedAt: string | null;
  /** Reviewer's reason when approvalStatus is 'rejected'. */
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  postPlatforms: PostPlatform[];
  labels: Label[];
  recurringSchedule?: PostRecurringSchedule | null;
  metrics?: PostMetricsSummary | null;
}

/** Parameters for listing posts. */
export interface ListPostsParams extends PaginationParams {
  /** Filter by post status. */
  status?: PostStatus;
  /** Filter by channel ID. */
  channelId?: string;
  /** Filter by a single label ID. */
  labelId?: string;
  /** Comma-separated label IDs for multi-label filtering. */
  labelIds?: string;
  /** How to combine multiple labels: 'or' (any) or 'and' (all). Default: 'or'. */
  labelMode?: 'or' | 'and';
  /** Filter posts created on or after this date (ISO 8601). */
  from?: string;
  /** Filter posts created on or before this date (ISO 8601). */
  to?: string;
  /** Filter posts scheduled on or after this date (ISO 8601). */
  scheduledFrom?: string;
  /** Filter posts scheduled on or before this date (ISO 8601). */
  scheduledTo?: string;
  /** Search post content. */
  search?: string;
  /** Set to 'true' to only return recurring posts. */
  recurring?: string;
  /** Filter by team approval state (e.g. 'pending' for the approval queue). */
  approvalStatus?: PostApprovalStatus;
}

/** Response from listing posts. */
export interface ListPostsResponse {
  posts: Post[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/** Parameters for creating a new post. */
export interface CreatePostParams {
  /** The post text content. */
  content?: string;
  /** Array of media file IDs to attach. */
  mediaFiles?: number[];
  /** Post status: 'draft' or 'scheduled'. */
  status?: 'draft' | 'scheduled';
  /** ISO 8601 datetime for scheduled publishing. Required when status is 'scheduled'. */
  scheduledAt?: string;
  /** IANA timezone string (e.g. 'America/New_York'). Default: 'UTC'. */
  timezone?: string;
  /** Target channels. At least one is required. */
  channels: PostChannelEntry[];
  /** Array of label IDs to attach. */
  labels?: number[];
  /** Post format. Default: 'post'. */
  postFormat?: PostFormat;
  /**
   * Per-platform post type overrides.
   *
   * Valid types per platform:
   * - facebook: `post`, `reel`, `story`
   * - instagram: `feed_photo`, `feed_video`, `reel`, `story`, `carousel`
   * - x: `tweet`
   * - youtube: `video`, `short` (video file required)
   * - tiktok: `video`, `photo_slideshow`
   * - linkedin: `post`, `multi_image`, `pdf_carousel`, `article`
   * - pinterest: `pin`, `video_pin`, `carousel`
   * - threads: `text`, `image`, `video`, `carousel`
   * - bluesky: `post`
   * - mastodon: `post`
   * - gmb: `standard`, `event`, `offer`
   *
   * @example { instagram: 'reel', facebook: 'story' }
   */
  postTypeOverrides?: Record<string, string>;
  /**
   * Per-platform specific settings.
   *
   * Required fields by platform:
   * - **youtube**: `{ title }` (required, 1-100 chars). Optional: `privacyStatus`, `categoryId`, `tags`, `playlistId`, `thumbnailUrl`, `madeForKids`
   * - **pinterest**: `{ title }` (required, 1-100 chars). Optional: `boardId` (or falls back to channel default), `description`, `link`, `dominantColor` (hex e.g. #FF5733), `coverImageUrl` (video pins; when omitted the server falls back to an attached image, then the video's auto-extracted poster frame)
   * - **instagram**: Optional: `collaborators`, `trialReel`, `thumbnailTimestamp`
   * - **tiktok**: Optional: `privacyLevel` (SELF_ONLY|PUBLIC|FRIENDS), `disableDuet`, `disableStitch`, `disableComment`, `isAigc`
   * - **linkedin**: Optional: `title`, `description`, `url` (required for article type), `carouselTitle`
   * - **gmb**: Optional: `ctaType`, `ctaUrl`, `eventTitle`, `startDate`, `endDate`, `startTime`, `endTime`, `couponCode`, `redeemOnlineUrl`
   * - **mastodon**: Optional: `visibility` (public|unlisted|private|direct), `spoilerText`, `language`
   * - **threads**: Optional: `quotePostId`
   *
   * @example { youtube: { title: 'My Video' }, pinterest: { title: 'My Pin', boardId: '123' } }
   */
  platformSpecific?: Record<string, Record<string, unknown>>;
  /**
   * Per-platform content overrides for different character limits.
   * Use for platforms with lower limits (bluesky: 300, pinterest/threads/mastodon: 500).
   *
   * @example { bluesky: 'Short version', linkedin: 'Longer professional version' }
   */
  platformContent?: Record<string, string>;
  /**
   * Whether to delete uploaded media right after publishing. Default: false —
   * media is kept and reclaimed by the server's 3-month retention sweep.
   * Forced to false by the server when the post has a repeatSchedule.
   */
  deleteMediaAfterPublish?: boolean;
  /** Recurring schedule configuration. */
  repeatSchedule?: RepeatScheduleConfig;
  /** Thread parts for thread format. Requires at least 2 parts. */
  threadParts?: ThreadPart[];
  /** Per-platform thread part overrides. */
  platformThreadParts?: Record<string, ThreadPart[]>;
  /** Enable auto-plug (reply with promo after engagement threshold). */
  autoPlugEnabled?: boolean;
  /** Text for auto-plug reply. */
  autoPlugText?: string;
  /** Engagement threshold (likes) to trigger auto-plug. Default: 50. */
  autoPlugThreshold?: number;
  /** Enable auto-repost. */
  autoRepostEnabled?: boolean;
  /** Engagement threshold (likes) to trigger auto-repost. Default: 100. */
  autoRepostThreshold?: number;
  /**
   * Optional. Set true to hold a scheduled post for team approval
   * (approvalStatus becomes 'pending'). Forced on server-side for roles
   * without post:publish (contributors), regardless of this flag.
   * Default: false.
   */
  requestApproval?: boolean;
  /**
   * Per-post override for link tracking (bulkpubli.sh). `true` forces links in
   * this post to be shortened and their clicks counted, `false` forces them to
   * publish as written, and `null`/omitted (the default) inherits the
   * organization's Link Tracking setting.
   *
   * Shortening happens at publish time, per channel, so two accounts on the
   * same platform get distinct codes. It is skipped for a channel when the
   * rewrite would push the post past that platform's character limit — a short
   * URL is 28 characters and can be longer than the link it replaces.
   */
  linkTrackingOverride?: boolean | null;
}

/** Parameters for updating an existing post. All fields are optional. */
export interface UpdatePostParams {
  content?: string;
  mediaFiles?: number[];
  /**
   * Move the post between draft and scheduled. Setting 'scheduled' requires a
   * future scheduledAt (in this request or already stored) and at least one
   * channel; setting 'draft' unschedules it. Any other value is rejected. Omit
   * to leave the status unchanged (failed/partial posts still auto-reset to
   * draft on edit). To publish immediately, use posts.publish() instead.
   */
  status?: 'draft' | 'scheduled';
  scheduledAt?: string | null;
  timezone?: string;
  channels?: PostChannelEntry[];
  labels?: number[];
  postFormat?: PostFormat;
  postTypeOverrides?: Record<string, string>;
  platformSpecific?: Record<string, Record<string, unknown>>;
  platformContent?: Record<string, string>;
  deleteMediaAfterPublish?: boolean;
  repeatSchedule?: RepeatScheduleConfig;
  threadParts?: ThreadPart[];
  platformThreadParts?: Record<string, ThreadPart[]>;
  autoPlugEnabled?: boolean;
  autoPlugText?: string;
  autoPlugThreshold?: number;
  autoRepostEnabled?: boolean;
  autoRepostThreshold?: number;
  /**
   * Optional. Set true to hold a scheduled post for team approval
   * (approvalStatus becomes 'pending'). Forced on server-side for roles
   * without post:publish (contributors), regardless of this flag.
   * Default: false.
   */
  requestApproval?: boolean;
  /**
   * Per-post override for link tracking (bulkpubli.sh). `true` forces links in
   * this post to be shortened and their clicks counted, `false` forces them to
   * publish as written, and `null` clears the override so the post inherits the
   * organization's Link Tracking setting again.
   */
  linkTrackingOverride?: boolean | null;
}

/** Parameters for rejecting a pending post. */
export interface RejectPostParams {
  /** Optional reason, max 2000 chars. Shown to the author (in-app notification + on the post). */
  reason?: string;
}

/** Response from publishing a post. */
export interface PublishPostResponse extends Post {}

/** Response from retrying failed platforms on a post. */
export interface RetryPostResponse extends Post {
  retriedCount: number;
  skippedMaxRetries: number;
}

/** Parameters for publishing a story from a post. */
export interface PublishStoryParams {
  /** Platform to publish the story on. Must be 'facebook' or 'instagram'. */
  platform: 'facebook' | 'instagram';
}

/** Response from publishing a story. */
export interface PublishStoryResponse {
  success: boolean;
  postId?: string;
  url?: string;
  error?: string;
}

/** Parameters for bulk post actions. */
export interface BulkPostParams {
  /** The bulk action to perform. */
  action: BulkAction;
  /** Array of post IDs to act on. */
  postIds: number[];
  /** New scheduled time (required for 'reschedule' action). */
  scheduledAt?: string;
}

/** Response from a bulk post action. */
export interface BulkPostResponse {
  success: boolean;
  action: BulkAction;
  affected: number;
  scheduledAt?: string;
}

/** Response from getting the next queue slot. */
export interface QueueSlotResponse {
  suggestedTime: string;
  timezone: string;
}

// ---------- Post Metrics ----------

/** Latest metrics snapshot for a single platform. */
export interface MetricsSnapshot {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  clicks: number | null;
  videoViews: number | null;
  engagementRate: number | null;
  platformSpecificMetrics: Record<string, number>;
  fetchedAt: string;
}

/** Historical metrics data point. */
export interface MetricsHistoryPoint {
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  fetchedAt: string;
}

/** Per-platform metrics for a post. */
export interface PostPlatformMetrics {
  platform: Platform;
  platformPostId: string | null;
  platformUrl: string | null;
  status: PlatformStatus;
  latest: MetricsSnapshot | null;
  history: MetricsHistoryPoint[];
  /**
   * Clicks on bulkpubli.sh short links in this post on this platform, measured
   * by BulkPublish rather than reported by the platform.
   *
   * Deliberately OUTSIDE `latest`: it is not a platform snapshot, so a platform
   * that reports no metrics at all still has link clicks. It is also distinct
   * from `latest.clicks` (the platform's own click figure) — one visit can
   * register in both, so never add them together. Bot and link-preview traffic
   * is excluded. Zero for organizations without Link Tracking enabled.
   */
  linkClicks: number;
}

/** Response from getting post metrics. */
export interface PostMetricsResponse {
  postId: number;
  platforms: PostPlatformMetrics[];
  totals: {
    impressions: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    videoViews: number;
    /** Sum of `platforms[].linkClicks`. Not folded into `clicks`. */
    linkClicks: number;
  };
}

// ---------- Analytics ----------

/** Parameters for analytics endpoints that require a date range. */
export interface AnalyticsDateParams {
  /** Start date (ISO 8601 date string, e.g. '2026-01-01'). */
  from: string;
  /** End date (ISO 8601 date string, e.g. '2026-01-31'). */
  to: string;
}

/** Per-platform breakdown in analytics summary. */
export interface AnalyticsPlatformBreakdown {
  total: number;
  published: number;
  failed: number;
}

/** Daily post count in analytics summary. */
export interface AnalyticsDayCount {
  date: string;
  count: number;
  platforms: Record<string, number>;
}

/** Response from the analytics summary endpoint. */
export interface AnalyticsSummaryResponse {
  totalPosts: number;
  published: number;
  failed: number;
  scheduled: number;
  partial: number;
  byPlatform: Record<string, AnalyticsPlatformBreakdown>;
  byDay: AnalyticsDayCount[];
}

/** Parameters for the engagement analytics endpoint. */
export interface AnalyticsEngagementParams extends AnalyticsDateParams {
  /** Optional channel ID to filter by. */
  channelId?: string;
  /**
   * Set to `'1'` to return only the ranked `topPosts` leaderboard; `allPosts`
   * comes back empty. Use it when you render a short list and don't want to
   * download every post in the window.
   */
  top?: '1';
  /**
   * Sort field for `allPosts`. `linkClicks` sorts by bulkpubli.sh click count.
   * Default: `'date'`.
   */
  sort?: 'date' | 'impressions' | 'likes' | 'comments' | 'shares' | 'linkClicks';
  /** Sort direction for `allPosts`. Default: `'desc'`. */
  order?: 'asc' | 'desc';
}

/** Per-platform engagement breakdown. */
export interface EngagementPlatformBreakdown {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  posts: number;
  /** bulkpubli.sh short-link clicks. Measured by BulkPublish, not the platform. */
  linkClicks: number;
}

/** Daily engagement data point. */
export interface EngagementDayData {
  date: string;
  impressions: number;
  engagements: number;
  reach: number;
  /** bulkpubli.sh short-link clicks on this day. */
  linkClicks: number;
}

/** A top-performing post in engagement analytics. */
export interface TopPost {
  postId: number;
  content: string;
  thumbnail?: string;
  publishedAt: string;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  /** bulkpubli.sh short-link clicks for this post. */
  linkClicks: number;
  platforms: Array<{ platform: string; platformUrl: string }>;
}

/** Response from the engagement analytics endpoint. */
export interface AnalyticsEngagementResponse {
  totalImpressions: number;
  totalEngagements: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalClicks: number;
  totalSaves: number;
  totalVideoViews: number;
  totalReach: number;
  /**
   * Clicks on bulkpubli.sh short links across the window, measured by
   * BulkPublish rather than reported by the platform.
   *
   * Deliberately NOT folded into `totalClicks`, which is the platforms' own
   * click figure: one visit can register in both, so adding them double-counts.
   * Because we measure it ourselves it is available on every platform,
   * including those that report no per-post metrics at all. Bot and
   * link-preview traffic is excluded. Zero for organizations that have not
   * enabled Link Tracking.
   */
  totalLinkClicks: number;
  /** Average engagement rate in basis points (325 = 3.25%). */
  avgEngagementRate: number;
  byPlatform: Record<string, EngagementPlatformBreakdown>;
  byDay: EngagementDayData[];
  topPosts: TopPost[];
}

/** Response from refreshing analytics. */
export interface AnalyticsRefreshResponse {
  queued: boolean;
}

/** Parameters for account-level analytics. */
export interface AnalyticsAccountParams {
  /** Optional channel ID to filter by. */
  channelId?: string;
  /** Start date. Default: 30 days ago. */
  from?: string;
  /** End date. Default: today. */
  to?: string;
}

/** Account metrics data point. */
export interface AccountMetricsDataPoint {
  date: string;
  channelId: number;
  platform: string;
  followers: number | null;
  following: number | null;
  impressions: number | null;
  reach: number | null;
  /** Facebook only (`page_views_total`); null/0 elsewhere — not measured. */
  profileViews: number | null;
  /** Google Business only; null/0 elsewhere — not measured. */
  websiteClicks: number | null;
  /**
   * ALWAYS null. No platform handler computes an account-level engagement rate,
   * so the server returns null rather than a 0 that would look like a measured
   * 0%. For a real rate use `platformMetrics[].engagementRate` from
   * `analytics.engagement()`.
   */
  engagementRate: number | null;
}

/** Channel reference in account analytics. */
export interface AccountChannel {
  id: number;
  platform: Platform;
  accountName: string;
}

/** Response from account-level analytics. */
export interface AnalyticsAccountResponse {
  metrics: AccountMetricsDataPoint[];
  channels: AccountChannel[];
}

// ---------- Labels ----------

/** Parameters for listing labels. */
export interface ListLabelsParams {
  /** Filter by label type: 'post' or 'media'. */
  type?: LabelType;
}

/** Parameters for creating a label. */
export interface CreateLabelParams {
  /** Label name. */
  name: string;
  /** Hex color (e.g. '#6366f1'). Default: '#6366f1'. */
  color?: string;
  /** Label type: 'post' or 'media'. Default: 'post'. */
  type?: LabelType;
}

/** Parameters for updating a label. */
export interface UpdateLabelParams {
  /** New label name. */
  name?: string;
  /** New hex color. */
  color?: string;
}

// ---------- Schedules ----------

/** A recurring schedule. */
export interface RecurringSchedule {
  id: number;
  userId: string;
  organizationId: number;
  name: string;
  frequency: RecurringFrequency;
  dayOfWeek: number | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string | null;
  channelIds: number[];
  mediaFileIds: number[];
  contentTemplate: string;
  postTypeOverrides: Record<string, string>;
  platformSpecific: Record<string, Record<string, unknown>>;
  postFormat: string | null;
  threadParts: ThreadPart[] | null;
  isActive: boolean | null;
  lastRunAt: string | null;
  nextRunAt: string | null;
  /**
   * Whether every occurrence this schedule generates is held for team approval.
   */
  requireApproval?: boolean;
  createdAt: string;
}

/** Parameters for creating a recurring schedule. */
export interface CreateScheduleParams {
  /** Schedule name. */
  name: string;
  /** Recurrence frequency. */
  frequency: RecurringFrequency;
  /** Day of week (0=Sunday, 6=Saturday). Required for weekly/biweekly. */
  dayOfWeek?: number;
  /** Day of month (1-31). Required for monthly. */
  dayOfMonth?: number;
  /** Time of day in HH:MM format (24h). */
  timeOfDay: string;
  /** IANA timezone. Default: 'UTC'. */
  timezone?: string;
  /** Channel IDs to publish to. At least one required. */
  channelIds: number[];
  /** Media file IDs to attach. */
  mediaFileIds?: number[];
  /** Post content template. */
  contentTemplate?: string;
  /** Per-platform post type overrides. */
  postTypeOverrides?: Record<string, string>;
  /** Per-platform specific settings. */
  platformSpecific?: Record<string, Record<string, unknown>>;
  /** Whether the schedule is active. Default: true. */
  isActive?: boolean;
  /**
   * Hold every occurrence this schedule generates for team approval — each
   * generated post lands with `approvalStatus: 'pending'` and the scheduler
   * skips it until an approver releases it via `posts.approve(id)`.
   * Default: false.
   */
  requireApproval?: boolean;
}

/** Parameters for updating a recurring schedule. All fields are optional. */
export interface UpdateScheduleParams {
  name?: string;
  frequency?: RecurringFrequency;
  dayOfWeek?: number | null;
  dayOfMonth?: number | null;
  timeOfDay?: string;
  timezone?: string;
  channelIds?: number[];
  mediaFileIds?: number[];
  contentTemplate?: string;
  postTypeOverrides?: Record<string, string>;
  platformSpecific?: Record<string, Record<string, unknown>>;
  isActive?: boolean;
  /**
   * Hold every occurrence this schedule generates for team approval — each
   * generated post lands with `approvalStatus: 'pending'` and the scheduler
   * skips it until an approver releases it via `posts.approve(id)`.
   * Default: false.
   */
  requireApproval?: boolean;
}

// ---------- API Keys ----------

/** An API key (listing view — does not include the full key). */
export interface ApiKeyInfo {
  id: number;
  name: string;
  keyPreview: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean | null;
  createdAt: string;
}

/** Parameters for creating an API key. */
export interface CreateApiKeyParams {
  /** A descriptive name for the key. */
  name: string;
  /** Optional expiration date (ISO 8601). */
  expiresAt?: string;
  /** Optional: number of days until expiration. */
  expires_in_days?: number;
}

/** Response from creating an API key — includes the full key (shown only once). */
export interface CreateApiKeyResponse {
  id: number;
  name: string;
  /** The full API key. Store this securely — it is only shown once. */
  key: string;
  keyPrefix: string;
  expiresAt: string | null;
  createdAt: string;
}

// ---------- Quotas ----------

/** Response from the quotas usage endpoint. */
export interface QuotasUsageResponse {
  organizationId: number;
  plan: string;
  daily: { used: number; limit: number; allowed: boolean };
  monthly: { used: number; limit: number; allowed: boolean };
  scheduled: { used: number; limit: number; allowed: boolean };
  channels: { used: number; limit: number; allowed: boolean };
  labels: { used: number; limit: number; allowed: boolean };
  mediaStorage: { used: number; limit: number; allowed: boolean };
  recurringSchedules: { used: number; limit: number; allowed: boolean };
  webhooks: { used: number; limit: number; allowed: boolean };
  apiKeys: { used: number; limit: number; allowed: boolean };
  apiRequests: { used: number; limit: number; allowed: boolean };
  [key: string]: unknown;
}

// ---------- Notifications ----------

/** A notification. */
export interface Notification {
  id: number;
  userId: string;
  organizationId: number | null;
  organizationName: string | null;
  type: NotificationType;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean | null;
  createdAt: string;
}

/** Parameters for listing notifications. */
export interface ListNotificationsParams extends PaginationParams {
  /** Only return unread notifications. */
  unreadOnly?: boolean;
}

/** Response from listing notifications. */
export interface ListNotificationsResponse {
  notifications: Notification[];
  pagination: PaginationMeta;
}

// ---------- Activity ----------

/** An activity log entry. */
export interface ActivityLog {
  id: number;
  userId: string | null;
  organizationId: number | null;
  action: string;
  resource: string | null;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  level: string | null;
  ipAddress: string | null;
  createdAt: string;
  thumbnail?: { url: string; mimeType: string };
}

/** Parameters for listing activity logs. */
export interface ListActivityParams extends PaginationParams {
  /** Filter by action (e.g. 'post.published'). */
  action?: string;
  /** Filter by resource type (e.g. 'post', 'channel'). */
  resource?: string;
}

/** Response from listing activity logs. */
export interface ListActivityResponse {
  activities: ActivityLog[];
  pagination: PaginationMeta;
}

// ---------- Channel Sets ----------

/** A saved channel grouping for one-click multi-channel targeting. */
export interface ChannelSet {
  id: number;
  userId: string;
  organizationId: number;
  name: string;
  channelIds: number[];
  createdAt: string;
  updatedAt: string;
}

/** Parameters for creating a channel set. */
export interface CreateChannelSetParams {
  /** Set name (max 100 chars, unique per organization). */
  name: string;
  /** IDs of channels in your organization (at least 1). */
  channelIds: number[];
}

/** Parameters for updating a channel set. At least one field is required. */
export interface UpdateChannelSetParams {
  /** New set name (max 100 chars, unique per organization). */
  name?: string;
  /** Replacement channel IDs (at least 1). */
  channelIds?: number[];
}

// ---------- RSS Autopost ----------

/**
 * Per-channel override inside an RSS field mapping. Text-only — media
 * selection (`mediaField`) cannot be overridden per channel, and channels on
 * the same platform share one rendered text (it is written to the post's
 * per-platform content, like composer overrides).
 */
export interface RssMappingChannelOverride {
  /** Caption template for this channel (max 2000 chars). */
  template?: string;
  /** Hashtags appended for this channel (max 500 chars). */
  hashtags?: string;
  stripHtml?: boolean;
  truncate?: 'smart' | 'hard' | 'skip';
}

/**
 * How an RSS/Atom item becomes post content. `null` on a feed means the
 * built-in default: template `"{title}\n\n{link}"`, no media, stripHtml true,
 * smart truncation, no hashtags.
 */
export interface RssFieldMapping {
  /**
   * Caption template (max 2000 chars). Tokens: {title} {link} {description}
   * {content} {author} {categories} {feedName}, plus any extra leaf field on
   * the feed item as {fieldName} (lowercased localName). A line whose tokens
   * all render empty is dropped. Default "{title}\n\n{link}".
   */
  template: string;
  /**
   * Which item enclosure to import and attach to the post: 'none' (default),
   * 'image', 'video', or 'auto' (video if present, else image). The file is
   * re-hosted to your media library; if the import fails the post is created
   * without media. Channels whose platform requires media (e.g. Instagram,
   * TikTok, YouTube) are skipped for items lacking a usable enclosure.
   */
  mediaField?: 'none' | 'image' | 'video' | 'auto';
  /** Strip HTML tags/entities from {title}/{description}/{content}. Default true. */
  stripHtml?: boolean;
  /**
   * When rendered text exceeds the platform character limit: 'smart' (default)
   * trims at a word boundary keeping a trailing link line; 'hard' cuts at the
   * limit; 'skip' drops that channel for the item.
   */
  truncate?: 'smart' | 'hard' | 'skip';
  /** Hashtags appended after the rendered template (max 500 chars). Default "". */
  hashtags?: string;
  /** Per-channel text overrides keyed by channel id (as a string). */
  channelOverrides?: Record<string, RssMappingChannelOverride>;
}

/** An RSS/Atom feed polled every 15 minutes; new items become posts. */
export interface RssFeed {
  id: number;
  userId: string;
  organizationId: number;
  name: string;
  feedUrl: string;
  channelIds: number[];
  /** 'draft' = new items become drafts for review; 'publish' = auto-published. */
  mode: 'draft' | 'publish';
  /** Field mapping controlling item → post rendering; null = built-in default. */
  fieldMapping: RssFieldMapping | null;
  enabled: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Parameters for adding an RSS feed. */
export interface CreateRssFeedParams {
  /** Feed name (max 100 chars). */
  name: string;
  /** Public RSS 2.0 or Atom feed URL (validated as reachable). */
  feedUrl: string;
  /** IDs of channels new items are posted to (at least 1). */
  channelIds: number[];
  /**
   * 'draft' = new items land as draft posts for review; 'publish' = auto-published.
   * Defaults to 'draft'.
   */
  mode?: 'draft' | 'publish';
  /**
   * Field mapping controlling how each item becomes a post (caption template,
   * media selection, truncation, hashtags, per-channel overrides). Omit for
   * the built-in default ("{title}\n\n{link}", no media).
   */
  fieldMapping?: RssFieldMapping;
  /**
   * Hold items auto-published from this feed for team approval — each generated
   * post lands with `approvalStatus: 'pending'` and waits for
   * `posts.approve(id)`. Only meaningful when `mode` is 'publish' (draft items
   * never publish on their own, and a feed force-demoted to draft by the plan
   * gate stays ungated). Default: false.
   */
  requireApproval?: boolean;
}

/** Parameters for updating an RSS feed (partial update). */
export interface UpdateRssFeedParams {
  name?: string;
  /**
   * New feed URL. Note: changing feedUrl re-baselines the feed — only items
   * published after the change are posted (the backlog is not flooded).
   */
  feedUrl?: string;
  channelIds?: number[];
  mode?: 'draft' | 'publish';
  /** New field mapping; pass null to clear back to the built-in default. */
  fieldMapping?: RssFieldMapping | null;
  enabled?: boolean;
  /**
   * Hold items auto-published from this feed for team approval — each generated
   * post lands with `approvalStatus: 'pending'` and waits for
   * `posts.approve(id)`. Only meaningful when `mode` is 'publish' (draft items
   * never publish on their own, and a feed force-demoted to draft by the plan
   * gate stays ungated). Default: false.
   */
  requireApproval?: boolean;
}

// ---------- Media multipart upload ----------

/** Parameters for starting a chunked (multipart) upload. */
export interface CreateMultipartUploadParams {
  /** One of the allowed media MIME types. */
  contentType: string;
  /** Exact file size in bytes. Videos up to 1GB; images up to 100MB. */
  sizeBytes: number;
}

/** Response from starting a multipart upload. */
export interface CreateMultipartUploadResponse {
  r2Key: string;
  uploadId: string;
  /** Fixed part size: 10485760 bytes (10MB). Every part except the last is exactly this size. */
  partSize: number;
  /** One presigned PUT URL per part, in order. */
  partUrls: string[];
  /** Seconds until the part URLs expire (3600). */
  expiresIn: number;
}

/** One uploaded part: its 1-based number and the ETag response header from its PUT. */
export interface MultipartUploadPart {
  partNumber: number;
  etag: string;
}

/** Parameters for completing a multipart upload. */
export interface CompleteMultipartUploadParams {
  r2Key: string;
  uploadId: string;
  /** All uploaded parts with their ETags (at least 1). */
  parts: MultipartUploadPart[];
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  duration?: number;
}
