import type { HttpClient } from './client.js';
import type { RssFeed, CreateRssFeedParams, UpdateRssFeedParams } from './types.js';

/**
 * Manage RSS autopost feeds — RSS/Atom feeds, checked on a schedule set by the plan
 * (every 60 minutes on Free and Lifetime, 30 on Pro, 15 on Business),
 * whose new items automatically become posts on the chosen channels.
 *
 * The number of feeds is capped by plan (Free 1, Lifetime 3, Pro 10, Business 50). New-item handling depends on `mode`:
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
 *     articleImage: 'when_needed', // default: borrow one from the article when a channel needs it
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
   * Forced to true for roles without publish rights (contributors): the flag
   * is set server-side on create and on every update, including an update
   * that does not send it, so a member who cannot publish a single post
   * cannot own an automation that publishes without review.
   *
   * @throws 400 if the input is invalid.
   * @throws 403 (`ForbiddenError`, code `QUOTA_EXCEEDED`) if the organization is at its
   *   plan's feed limit, or code `FEATURE_DISABLED` for `mode: 'publish'` on Free.
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
   *
   * Forced to true for roles without publish rights (contributors): the flag
   * is set server-side on create and on every update, including an update
   * that does not send it, so a member who cannot publish a single post
   * cannot own an automation that publishes without review.
   */
  async update(id: number, params: UpdateRssFeedParams): Promise<RssFeed> {
    return this.http.put(`/api/rss-feeds/${id}`, params);
  }

  /** Delete an RSS feed by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/rss-feeds/${id}`);
  }
}
