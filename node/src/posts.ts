import type { HttpClient } from './client.js';
import type {
  Post,
  ListPostsParams,
  ListPostsResponse,
  CreatePostParams,
  UpdatePostParams,
  PublishPostResponse,
  RetryPostResponse,
  PublishStoryParams,
  PublishStoryResponse,
  BulkPostParams,
  BulkPostResponse,
  QueueSlotResponse,
  PostMetricsResponse,
} from './types.js';

/**
 * Resource for managing posts.
 *
 * Access via `client.posts`.
 *
 * @example
 * ```typescript
 * const bp = new BulkPublish({ apiKey: 'bp_...' });
 *
 * // List recent posts
 * const { posts } = await bp.posts.list({ limit: 10 });
 *
 * // Create and schedule a post
 * const post = await bp.posts.create({
 *   content: 'Hello world!',
 *   channels: [{ channelId: 1, platform: 'x' }],
 *   status: 'scheduled',
 *   scheduledAt: '2026-04-10T09:00:00Z',
 * });
 * ```
 */
export class PostsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List posts with pagination and filters.
   *
   * @param params - Filtering and pagination options.
   * @returns Paginated list of posts with relations.
   *
   * @example
   * ```typescript
   * // Get all scheduled posts
   * const { posts, total } = await bp.posts.list({ status: 'scheduled' });
   *
   * // Search posts with pagination
   * const result = await bp.posts.list({
   *   search: 'product launch',
   *   page: 2,
   *   limit: 50,
   * });
   * ```
   */
  list(params?: ListPostsParams): Promise<ListPostsResponse> {
    return this.http.get<ListPostsResponse>('/api/posts', params as Record<string, string>);
  }

  /**
   * Get a single post by ID with all relations (platforms, labels, media, schedule).
   *
   * @param id - The post ID.
   * @returns The full post object with all related data.
   *
   * @example
   * ```typescript
   * const post = await bp.posts.get(42);
   * console.log(post.content, post.postPlatforms);
   * ```
   */
  get(id: number): Promise<Post> {
    return this.http.get<Post>(`/api/posts/${id}`);
  }

  /**
   * Create a new post (draft or scheduled).
   *
   * @param params - Post content, channels, schedule, and options.
   * @returns The created post with platform entries and labels.
   *
   * @example
   * ```typescript
   * // Create a draft post targeting X and LinkedIn
   * const post = await bp.posts.create({
   *   content: 'Big news coming soon!',
   *   channels: [
   *     { channelId: 1, platform: 'x' },
   *     { channelId: 2, platform: 'linkedin' },
   *   ],
   *   status: 'draft',
   * });
   *
   * // Create a scheduled post with media
   * const post = await bp.posts.create({
   *   content: 'Check out our new feature!',
   *   mediaFiles: [uploadedFile.id],
   *   channels: [{ channelId: 1, platform: 'instagram' }],
   *   postFormat: 'reel',
   *   status: 'scheduled',
   *   scheduledAt: '2026-04-10T14:00:00Z',
   *   timezone: 'America/New_York',
   * });
   * ```
   */
  create(params: CreatePostParams): Promise<Post> {
    return this.http.post<Post>('/api/posts', params);
  }

  /**
   * Update an existing post. Only draft, scheduled, failed, or partial posts can be edited.
   *
   * @param id - The post ID.
   * @param params - Fields to update. Only provided fields are changed.
   * @returns The updated post with platform entries and labels.
   *
   * @example
   * ```typescript
   * // Update post content and reschedule
   * const updated = await bp.posts.update(42, {
   *   content: 'Updated content!',
   *   scheduledAt: '2026-04-12T10:00:00Z',
   * });
   *
   * // Change target channels
   * const updated = await bp.posts.update(42, {
   *   channels: [{ channelId: 3, platform: 'threads' }],
   * });
   * ```
   */
  update(id: number, params: UpdatePostParams): Promise<Post> {
    return this.http.put<Post>(`/api/posts/${id}`, params);
  }

  /**
   * Delete a post and all its related records (platforms, labels).
   * Also deactivates any linked recurring schedule.
   *
   * @param id - The post ID.
   * @returns `{ success: true }` on success.
   *
   * @example
   * ```typescript
   * await bp.posts.delete(42);
   * ```
   */
  delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`/api/posts/${id}`);
  }

  /**
   * Immediately publish a draft, scheduled, or failed post.
   * The post is queued for publishing and its status changes to 'publishing'.
   *
   * @param id - The post ID.
   * @returns The post with updated status and platform entries.
   *
   * @example
   * ```typescript
   * // Publish a draft immediately
   * const result = await bp.posts.publish(42);
   * console.log(result.status); // 'publishing'
   * ```
   */
  publish(id: number): Promise<PublishPostResponse> {
    return this.http.post<PublishPostResponse>(`/api/posts/${id}/publish`);
  }

  /**
   * Retry failed platform deliveries for a post.
   * Only platforms that haven't exceeded their max retry count are retried.
   *
   * @param id - The post ID.
   * @returns The post with retry counts.
   *
   * @example
   * ```typescript
   * const result = await bp.posts.retry(42);
   * console.log(`Retried ${result.retriedCount} platforms, skipped ${result.skippedMaxRetries}`);
   * ```
   */
  retry(id: number): Promise<RetryPostResponse> {
    return this.http.post<RetryPostResponse>(`/api/posts/${id}/retry`);
  }

  /**
   * Get engagement metrics for a post, broken down by platform.
   * Includes the latest snapshot and up to 10 historical data points per platform.
   *
   * @param id - The post ID.
   * @returns Metrics by platform and aggregate totals.
   *
   * @example
   * ```typescript
   * const metrics = await bp.posts.metrics(42);
   * console.log(metrics.totals.impressions, metrics.totals.likes);
   * for (const p of metrics.platforms) {
   *   console.log(p.platform, p.latest?.impressions);
   * }
   * ```
   */
  metrics(id: number): Promise<PostMetricsResponse> {
    return this.http.get<PostMetricsResponse>(`/api/posts/${id}/metrics`);
  }

  /**
   * Publish the post's first media as a story to Facebook or Instagram.
   *
   * @param id - The post ID (must have at least one media file and a matching platform).
   * @param params - Which platform to publish the story on.
   * @returns The story publish result with postId and URL.
   *
   * @example
   * ```typescript
   * const result = await bp.posts.story(42, { platform: 'instagram' });
   * if (result.success) {
   *   console.log('Story published:', result.url);
   * }
   * ```
   */
  story(id: number, params: PublishStoryParams): Promise<PublishStoryResponse> {
    return this.http.post<PublishStoryResponse>(`/api/posts/${id}/story`, params);
  }

  /**
   * Perform bulk actions on multiple posts at once.
   *
   * - `delete` — Delete selected posts.
   * - `retry` — Retry failed/partial posts.
   * - `reschedule` — Reschedule draft/scheduled posts to a new time.
   *
   * @param params - The action, post IDs, and optional scheduledAt.
   * @returns The number of affected posts.
   *
   * @example
   * ```typescript
   * // Bulk delete
   * await bp.posts.bulk({ action: 'delete', postIds: [1, 2, 3] });
   *
   * // Bulk retry failed posts
   * await bp.posts.bulk({ action: 'retry', postIds: [4, 5] });
   *
   * // Bulk reschedule
   * await bp.posts.bulk({
   *   action: 'reschedule',
   *   postIds: [6, 7],
   *   scheduledAt: '2026-04-15T09:00:00Z',
   * });
   * ```
   */
  bulk(params: BulkPostParams): Promise<BulkPostResponse> {
    return this.http.post<BulkPostResponse>('/api/posts/bulk', params);
  }

  /**
   * Get the next available queue slot for scheduling a post.
   * Useful for auto-suggesting optimal publish times.
   *
   * @param timezone - IANA timezone string (default: 'UTC').
   * @returns The suggested time slot.
   *
   * @example
   * ```typescript
   * const slot = await bp.posts.queueSlot('America/New_York');
   * console.log('Next available slot:', slot.suggestedTime);
   * ```
   */
  queueSlot(timezone?: string): Promise<QueueSlotResponse> {
    return this.http.get<QueueSlotResponse>('/api/posts/queue-slot', { timezone });
  }
}
