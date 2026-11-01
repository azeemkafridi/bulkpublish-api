import type { HttpClient } from './client.js';

export interface ReviewLink {
  id: number;
  name: string | null;
  shareToken: string;
  createdAt: string;
  /** Only present when listing (list()). */
  postCount?: number;
  /** The public review URL: https://app.bulkpublish.com/p/schedule/<shareToken>. */
  url: string;
}

/**
 * Client review links covering a batch of posts at once — the multi-post
 * counterpart of `posts.share()` / `posts.unshare()`. One link, several
 * posts: hand a client one URL to review everything queued for them,
 * instead of one link per post.
 *
 * Pro and Business only: the single-seat plans (Free, Lifetime) have no
 * client collaboration, and every method here answers 403 FEATURE_DISABLED
 * with `plan` and `upgrade: true` for them.
 *
 * @example
 * ```ts
 * const { reviewLink, url } = await bp.reviewLinks.create({
 *   postIds: [101, 102, 103],
 *   name: 'Acme Corp — Week of Sep 8',
 * });
 * ```
 */
export class ReviewLinksResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * The organization's review links, newest first, with each one's post count.
   * Paged: 50 per page by default (`limit` up to 100). `total` counts every
   * link, so keep requesting `page + 1` while `page * limit < total`.
   */
  async list(params: { page?: number; limit?: number } = {}): Promise<{ reviewLinks: ReviewLink[]; page: number; limit: number; total: number }> {
    return this.http.get('/api/review-links', params);
  }

  /**
   * Create a review link covering `postIds` (up to 50, all must belong to
   * your organization). Unlike a single post's link this is never
   * regenerated in place — every call mints a new link and a new token.
   */
  async create(params: { postIds: number[]; name?: string }): Promise<{ reviewLink: ReviewLink; url: string }> {
    return this.http.post('/api/review-links', params);
  }

  /** Revoke a review link. The posts it covered are untouched. */
  async delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete(`/api/review-links/${id}`);
  }
}
