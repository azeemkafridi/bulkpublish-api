import { HttpClient } from './client.js';
import { PostsResource } from './posts.js';
import { ChannelsResource } from './channels.js';
import { MediaResource } from './media.js';
import { AnalyticsResource } from './analytics.js';
import { LabelsResource } from './labels.js';
import { SchedulesResource } from './schedules.js';
import { ChannelSetsResource } from './channel-sets.js';
import { RssFeedsResource } from './rss-feeds.js';
import { PlatformsResource } from './platforms.js';
import type {
  ActivityLog,
  ApiKeyInfo,
  ApiKeyUsage,
  ApiKeyUsageHistoryEntry,
  BulkPublishOptions,
  CreateApiKeyParams,
  CreateApiKeyResponse,
  LinkPreview,
  ListActivityParams,
  ListActivityResponse,
  ListNotificationsParams,
  ListNotificationsResponse,
  NotificationPreferences,
  Organization,
  QuotasUsageResponse,
  UpdateNotificationPreferencesParams,
} from './types.js';

/**
 * BulkPublish API client — publish to 15 social media platforms from a single SDK.
 *
 * @example
 * ```ts
 * import { BulkPublish } from 'bulkpublish';
 *
 * const bp = new BulkPublish({ apiKey: 'bp_your_key_here' });
 *
 * // List connected channels
 * const { channels } = await bp.channels.list();
 *
 * // Upload media and create a scheduled post
 * const { file } = await bp.media.upload('./photo.jpg');
 * const post = await bp.posts.create({
 *   content: 'Hello from the API!',
 *   channels: [{ channelId: channels[0].id, platform: channels[0].platform }],
 *   mediaFiles: [file.id],
 *   scheduledAt: '2026-04-10T09:00:00Z',
 *   timezone: 'America/New_York',
 *   status: 'scheduled',
 * });
 * ```
 */
export class BulkPublish {
  readonly posts: PostsResource;
  readonly channels: ChannelsResource;
  readonly media: MediaResource;
  readonly analytics: AnalyticsResource;
  readonly labels: LabelsResource;
  readonly schedules: SchedulesResource;
  readonly channelSets: ChannelSetsResource;
  readonly rssFeeds: RssFeedsResource;
  readonly platforms: PlatformsResource;

  private readonly http: HttpClient;

  constructor(options: BulkPublishOptions) {
    const http = new HttpClient(options);
    this.http = http;
    this.posts = new PostsResource(http);
    this.channels = new ChannelsResource(http);
    this.media = new MediaResource(http);
    this.analytics = new AnalyticsResource(http);
    this.labels = new LabelsResource(http);
    this.schedules = new SchedulesResource(http);
    this.channelSets = new ChannelSetsResource(http);
    this.rssFeeds = new RssFeedsResource(http);
    this.platforms = new PlatformsResource(http);
  }

  // ---------------------------------------------------------------------
  // Account-level endpoints.
  //
  // These hang off the client rather than a resource namespace because each is
  // a single call against the account rather than a CRUD surface — matching
  // the Python SDK, which has had them since 0.9. Their response types were
  // already declared in types.ts; only the methods were missing, so Node users
  // had no way to read quotas, API-key usage, notifications, organizations,
  // link previews, or the activity log.
  // ---------------------------------------------------------------------

  /** List this organization's API keys. Secrets are masked. */
  listApiKeys(): Promise<{ keys: ApiKeyInfo[] }> {
    return this.http.get('/api/api-keys');
  }

  /**
   * Create an API key.
   *
   * The full key is returned ONCE, in `key` — it is not retrievable
   * afterwards, so store it before discarding the response.
   */
  createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResponse> {
    return this.http.post('/api/api-keys', params);
  }

  /** Revoke an API key. Requests using it fail immediately afterwards. */
  deleteApiKey(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/api-keys/${id}`);
  }

  /**
   * Today's API request usage against the plan's daily cap.
   *
   * `today` counts every key in the organization, not just the one
   * authenticating this call; `perKey` breaks the same day down by key.
   */
  apiKeyUsage(): Promise<ApiKeyUsage> {
    return this.http.get('/api/api-keys/usage');
  }

  /** Daily API request counts for the recent past, oldest day first. */
  apiKeyUsageHistory(): Promise<ApiKeyUsageHistoryEntry[]> {
    return this.http.get('/api/api-keys/usage/history');
  }

  /**
   * Current plan limits and usage.
   *
   * `usage` counters pair with `limits` keys — `usage.postsToday` with
   * `limits.postsPerDay`, `usage.scheduledToday` with `limits.scheduledPerDay`,
   * `usage.pendingScheduled` with `limits.maxPendingScheduled`. Check
   * `channelSlots.effectiveChannelLimit` rather than `limits.channels` when
   * deciding whether another channel can be connected: purchased slots raise
   * the enforced ceiling above the plan's base limit.
   *
   * @param timezone Optional IANA name (e.g. `America/New_York`) fixing the day
   *   boundary for `usage.scheduledToday`, so it matches the day the
   *   `scheduledPerDay` limit is enforced against. Defaults to UTC.
   */
  quotaUsage(timezone?: string): Promise<QuotasUsageResponse> {
    return this.http.get('/api/quotas/usage', timezone ? { tz: timezone } : undefined);
  }

  /** List notifications, newest first. */
  listNotifications(params?: ListNotificationsParams): Promise<ListNotificationsResponse> {
    return this.http.get('/api/notifications', params as Record<string, string | number | boolean | undefined | null> | undefined);
  }

  /** Read the authenticated user's notification preferences. */
  getNotificationPreferences(): Promise<NotificationPreferences> {
    return this.http.get('/api/notifications/preferences');
  }

  /**
   * Update notification preferences. Only the keys you pass are changed.
   *
   * Email categories are opt-in and default to `false`; in-app categories
   * default to `true`.
   */
  updateNotificationPreferences(
    prefs: UpdateNotificationPreferencesParams,
  ): Promise<NotificationPreferences> {
    return this.http.put('/api/notifications/preferences', prefs);
  }

  /**
   * List the organizations the authenticated user belongs to.
   *
   * Each entry's `role` is the caller's own role in that organization.
   */
  listOrganizations(): Promise<{ organizations: Organization[] }> {
    return this.http.get('/api/organizations');
  }

  /** Fetch Open Graph preview data for a URL. */
  linkPreview(url: string): Promise<LinkPreview> {
    return this.http.get('/api/link-preview', { url });
  }

  /** List the organization's activity log, newest first. */
  activityLog(params?: ListActivityParams): Promise<ListActivityResponse> {
    return this.http.get('/api/activity', params as Record<string, string | number | boolean | undefined | null> | undefined);
  }
}

// Re-export everything
export { HttpClient } from './client.js';
export { PostsResource } from './posts.js';
export { ChannelsResource } from './channels.js';
export { MediaResource } from './media.js';
export { AnalyticsResource } from './analytics.js';
export { LabelsResource } from './labels.js';
export { SchedulesResource } from './schedules.js';
export { ChannelSetsResource } from './channel-sets.js';
export { RssFeedsResource } from './rss-feeds.js';
export { PlatformsResource } from './platforms.js';
export {
  BulkPublishError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors.js';
export type * from './types.js';
