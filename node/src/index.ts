import { HttpClient } from './client.js';
import { PostsResource } from './posts.js';
import { ChannelsResource } from './channels.js';
import { MediaResource } from './media.js';
import { AnalyticsResource } from './analytics.js';
import { LabelsResource } from './labels.js';
import { SchedulesResource } from './schedules.js';
import type { BulkPublishOptions } from './types.js';

/**
 * BulkPublish API client — publish to 11 social media platforms from a single SDK.
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

  constructor(options: BulkPublishOptions) {
    const http = new HttpClient(options);
    this.posts = new PostsResource(http);
    this.channels = new ChannelsResource(http);
    this.media = new MediaResource(http);
    this.analytics = new AnalyticsResource(http);
    this.labels = new LabelsResource(http);
    this.schedules = new SchedulesResource(http);
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
export {
  BulkPublishError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors.js';
export type * from './types.js';
