import { HttpClient } from './client.js';
import { PostsResource } from './posts.js';
import { ChannelsResource } from './channels.js';
import { MediaResource } from './media.js';
import { AnalyticsResource } from './analytics.js';
import { LabelsResource } from './labels.js';
import { HashtagGroupsResource } from './hashtag-groups.js';
import { TemplatesResource } from './templates.js';
import { ReviewLinksResource } from './review-links.js';
import { ClientConnectLinksResource } from './client-connect-links.js';
import { CalendarNotesResource } from './calendar-notes.js';
import { SchedulesResource } from './schedules.js';
import { ChannelSetsResource } from './channel-sets.js';
import { RssFeedsResource } from './rss-feeds.js';
import { PlatformsResource } from './platforms.js';
import { OrganizationsResource } from './organizations.js';
import { NotificationsResource } from './notifications.js';
import { InboxResource } from './inbox.js';
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
  readonly hashtagGroups: HashtagGroupsResource;
  readonly templates: TemplatesResource;
  readonly reviewLinks: ReviewLinksResource;
  readonly clientConnectLinks: ClientConnectLinksResource;
  readonly calendarNotes: CalendarNotesResource;
  readonly schedules: SchedulesResource;
  readonly channelSets: ChannelSetsResource;
  readonly rssFeeds: RssFeedsResource;
  readonly platforms: PlatformsResource;
  readonly organizations: OrganizationsResource;
  readonly notifications: NotificationsResource;
  /** Direct messages, reviews and comment threads (Pro and Business plans). */
  readonly inbox: InboxResource;

  private readonly http: HttpClient;

  constructor(options: BulkPublishOptions) {
    const http = new HttpClient(options);
    this.http = http;
    this.posts = new PostsResource(http);
    this.channels = new ChannelsResource(http);
    this.media = new MediaResource(http);
    this.analytics = new AnalyticsResource(http);
    this.labels = new LabelsResource(http);
    this.hashtagGroups = new HashtagGroupsResource(http);
    this.templates = new TemplatesResource(http);
    this.reviewLinks = new ReviewLinksResource(http);
    this.clientConnectLinks = new ClientConnectLinksResource(http);
    this.calendarNotes = new CalendarNotesResource(http);
    this.schedules = new SchedulesResource(http);
    this.channelSets = new ChannelSetsResource(http);
    this.rssFeeds = new RssFeedsResource(http);
    this.platforms = new PlatformsResource(http);
    this.organizations = new OrganizationsResource(http);
    this.notifications = new NotificationsResource(http);
    this.inbox = new InboxResource(http);
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

  /**
   * List this organization's API keys, newest first. Secrets are masked;
   * each key reports its `access` level.
   *
   * The server answers with a plain array. Before 1.47.0 this was typed as
   * `{ keys: ApiKeyInfo[] }`, so `.keys` was always undefined at runtime.
   * A read-only key cannot call this (403 FORBIDDEN).
   */
  listApiKeys(): Promise<ApiKeyInfo[]> {
    return this.http.get('/api/api-keys');
  }

  /**
   * @deprecated Always fails with 403 for this client. Keys are created on
   * the API page in the app, from a signed-in session, so that a leaked key
   * can never mint itself a replacement; this client authenticates with an
   * API key, which the server refuses here. Kept so existing code compiles;
   * it will be removed in the next major version.
   */
  createApiKey(params: CreateApiKeyParams): Promise<CreateApiKeyResponse> {
    return this.http.post('/api/api-keys', params);
  }

  /**
   * @deprecated Always fails with 403 for this client. Keys are revoked on
   * the API page in the app, by the key's creator or a team admin, from a
   * signed-in session. Kept so existing code compiles; it will be removed in
   * the next major version.
   */
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
export { HashtagGroupsResource } from './hashtag-groups.js';
export { TemplatesResource } from './templates.js';
export type { PostTemplate, TemplateKind, TemplatePostFormat, TemplateMediaFile, TemplateSetup } from './templates.js';
export { ReviewLinksResource } from './review-links.js';
export type { ReviewLink } from './review-links.js';
export { ClientConnectLinksResource, CLIENT_CONNECT_PLATFORMS } from './client-connect-links.js';
export type { ClientConnectLink, ClientConnectLinkStatus } from './client-connect-links.js';
export { CalendarNotesResource } from './calendar-notes.js';
export type { CalendarNote } from './calendar-notes.js';
export type { HashtagGroup, CreateHashtagGroupParams, UpdateHashtagGroupParams } from './hashtag-groups.js';
export { SchedulesResource } from './schedules.js';
export { ChannelSetsResource } from './channel-sets.js';
export { RssFeedsResource } from './rss-feeds.js';
export { PlatformsResource } from './platforms.js';
export { OrganizationsResource } from './organizations.js';
export { NotificationsResource } from './notifications.js';
export { InboxResource } from './inbox.js';
export type {
  Conversation,
  ConversationKind,
  ConversationStatus,
  ConversationMessage,
  ConversationMessagesResponse,
  InboxPerson,
  ListConversationsParams,
  ListConversationsResponse,
  SendConversationMessageParams,
  SendConversationMessageResponse,
  UpdateConversationParams,
  ConversationLabel,
  AddConversationNoteParams,
  AddConversationNoteResponse,
  SetConversationLabelsResponse,
  SavedReply,
  SavedReplyParams,
  SavedReplyVariableKey,
  ListSavedRepliesResponse,
} from './inbox.js';
export {
  BulkPublishError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors.js';
export type * from './types.js';
