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
  | 'mastodon';

/** Supported post formats. */
export type PostFormat = 'post' | 'video' | 'reel' | 'story' | 'carousel' | 'thread';

/** Possible post statuses. */
export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed' | 'partial';

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
  thumbnailUrl: string | null;
  previewUrl?: string | null;
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
  /** Per-platform post type overrides (e.g. `{ instagram: 'reel' }`). */
  postTypeOverrides?: Record<string, string>;
  /** Per-platform specific settings. */
  platformSpecific?: Record<string, Record<string, unknown>>;
  /** Per-platform content overrides. */
  platformContent?: Record<string, string>;
  /** Whether to delete media after publishing. Default: true. */
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
}

/** Parameters for updating an existing post. All fields are optional. */
export interface UpdatePostParams {
  content?: string;
  mediaFiles?: number[];
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
}

/** Per-platform engagement breakdown. */
export interface EngagementPlatformBreakdown {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  posts: number;
}

/** Daily engagement data point. */
export interface EngagementDayData {
  date: string;
  impressions: number;
  engagements: number;
  reach: number;
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
  profileViews: number | null;
  websiteClicks: number | null;
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
