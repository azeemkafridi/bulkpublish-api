import type { HttpClient } from './client.js';
import type { RssFeed, CreateRssFeedParams, UpdateRssFeedParams } from './types.js';

/**
 * Manage RSS autopost feeds — RSS/Atom feeds polled every 15 minutes whose new
 * items automatically become posts on the chosen channels.
 *
 * An organization can have up to 20 feeds. New-item handling depends on `mode`:
 * `'draft'` (the default) creates draft posts for review; `'publish'`
 * auto-publishes them.
 *
 * @example
 * ```ts
 * const feed = await bp.rssFeeds.create({
 *   name: 'Company blog',
 *   feedUrl: 'https://example.com/rss.xml',
 *   channelIds: [1, 2],
 *   // mode defaults to 'draft'
 *   // Optional field mapping — how each item becomes a post:
 *   fieldMapping: {
 *     template: '{title}\n\n{link}',
 *     mediaField: 'auto',          // attach the item's video, else image
 *     hashtags: '#blog',
 *     channelOverrides: { '2': { template: '{title} — {description}\n{link}' } },
 *   },
 * });
 * ```
 */
export class RssFeedsResource {
  constructor(private readonly http: HttpClient) {}

  /** List all RSS feeds in the current organization, ordered by name. */
  async list(): Promise<RssFeed[]> {
    return this.http.get('/api/rss-feeds');
  }

  /**
   * Add an RSS feed. The server validates that `feedUrl` is a reachable public
   * RSS 2.0 or Atom feed. `mode` defaults to `'draft'`.
   *
   * Pass `requireApproval: true` to hold items auto-published from this feed
   * for team approval — each generated post lands with
   * `approvalStatus: 'pending'` and waits for `posts.approve(id)`. Only
   * meaningful when `mode` is `'publish'`: draft items never publish on their
   * own, and a feed force-demoted to draft by the plan gate stays ungated.
   * Default: false.
   *
   * @throws 400 if the input is invalid or the organization already has 20 feeds.
   */
  async create(params: CreateRssFeedParams): Promise<RssFeed> {
    return this.http.post('/api/rss-feeds', params);
  }

  /**
   * Update an RSS feed (partial update).
   *
   * Note: changing `feedUrl` re-baselines the feed — its check state resets and
   * only items published after the change are posted, so the new feed's
   * backlog is not flooded onto your channels.
   *
   * Toggling `requireApproval` affects future items only — posts already
   * created from the feed keep the approval status they were created with.
   */
  async update(id: number, params: UpdateRssFeedParams): Promise<RssFeed> {
    return this.http.put(`/api/rss-feeds/${id}`, params);
  }

  /** Delete an RSS feed by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/rss-feeds/${id}`);
  }
}
