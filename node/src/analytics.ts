import type { HttpClient } from './client.js';

/**
 * Filters shared by every analytics endpoint (added 2026-09-03). All optional;
 * a post must match every filter that is set.
 */
export interface AnalyticsFilterParams {
  /** Comma-separated channel ids, e.g. `'12,15'`. Only post_platform rows on these channels count. */
  channelIds?: string;
  /** Comma-separated platform keys, e.g. `'x,linkedin'`. Unknown keys are ignored. */
  platforms?: string;
  /** Comma-separated label ids; a post matches when it carries ANY of them. */
  labelIds?: string;
  /** `'post'` (single) or `'thread'`. */
  postFormat?: 'post' | 'thread';
  /** `'text'` (no media), `'image'` or `'video'`, by the post's first media file. */
  mediaType?: 'text' | 'image' | 'video';
  /**
   * Set to `'1'` to also compute the equal-length window immediately before
   * `from`. The response then carries `previous` (same totals for that window)
   * and `previousWindow` (`{from, to, days, available}`). `previous` is `null`
   * when the earlier window would reach past the 30-day retention floor — in
   * practice comparison works for windows of 15 days or fewer.
   */
  compare?: '1';
}

export interface AnalyticsSummaryParams extends AnalyticsFilterParams {
  from?: string;
  to?: string;
  /** Legacy single-channel filter; equivalent to `channelIds`. */
  channelId?: number;
}

export type AnalyticsRankField =
  | 'impressions' | 'reach' | 'likes' | 'comments' | 'shares' | 'saves'
  | 'clicks' | 'videoViews' | 'linkClicks' | 'engagements' | 'engagementRate';

export interface EngagementParams extends AnalyticsFilterParams {
  from?: string;
  to?: string;
  /** Legacy single-channel filter; equivalent to `channelIds`. */
  channelId?: number;
  /**
   * @deprecated The server has never read this. `byDay` is always daily
   * buckets; passing `'week'` or `'month'` silently returned daily data.
   * Aggregate client-side. This field is kept only so existing builds keep
   * compiling and will be removed in the next major.
   */
  groupBy?: 'day' | 'week' | 'month';
  /**
   * Set to `'1'` to return only the ranked `topPosts` leaderboard; `allPosts`
   * comes back empty.
   */
  top?: '1';
  /**
   * Sort field for `allPosts`. `engagements` = likes + comments + shares +
   * clicks; `linkClicks` sorts by bulkpubli.sh short-link click count;
   * `engagementRate` by the post-level rate. Default: `'date'`.
   */
  sort?: 'date' | AnalyticsRankField;
  /** Sort direction for `allPosts`. Default: `'desc'`. */
  order?: 'asc' | 'desc';
  /** Metric `topPosts` is ranked by. Default: `'impressions'`. */
  topBy?: AnalyticsRankField;
  /** `'desc'` (default) for the best posts, `'asc'` for the worst. */
  topOrder?: 'asc' | 'desc';
  /**
   * Set to `'1'` to include `postTimes` — one `{t, e, i}` (publish instant,
   * engagements, impressions) per published post_platform, up to 5000, for
   * engagement-weighted best-time-to-post views.
   */
  heatmap?: '1';
}

export interface AccountMetricsParams {
  /** Legacy single-channel filter; equivalent to `channelIds`. */
  channelId?: number;
  /** Comma-separated channel ids. */
  channelIds?: string;
  /** Comma-separated platform keys. */
  platforms?: string;
  /** Start date (YYYY-MM-DD), default 30 days ago; clamped to 30 days before `to`. */
  from?: string;
  /** End date (YYYY-MM-DD), default today. */
  to?: string;
}

export interface PostHistoryParams {
  /** The post id. */
  postId: number;
}

export interface LinksParams extends Omit<AnalyticsFilterParams, 'compare'> {
  from: string;
  to: string;
}

/**
 * Access analytics and engagement data across your connected channels.
 *
 * @example
 * ```ts
 * const summary = await bp.analytics.summary({ from: '2026-04-01', to: '2026-04-08' });
 * const engagement = await bp.analytics.engagement({ from: '2026-04-01', to: '2026-04-08' });
 * ```
 */
export class AnalyticsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * Get an analytics summary (impressions, engagement, followers) for a date range.
   *
   * @example
   * ```ts
   * const data = await bp.analytics.summary({
   *   from: '2026-04-01',
   *   to: '2026-04-08',
   *   channelId: 5, // optional — filter to one channel
   * });
   * console.log(data.impressions, data.engagementRate);
   * ```
   */
  async summary(params?: AnalyticsSummaryParams): Promise<any> {
    return this.http.get('/api/analytics/summary', params as Record<string, string | number | undefined>);
  }

  /**
   * Get engagement data grouped by time period.
   *
   * All figures come from the stored metrics snapshot, synced every 6 hours (or
   * on demand via {@link refresh}) — not a live read of the platform.
   *
   * The response's `unmeasuredPlatforms` lists platforms in the window that
   * cannot report per-post metrics: Google Business and Telegram have no
   * readable metrics API, Tumblr reports only a combined note count that
   * cannot be split, and LinkedIn exposes share statistics only for
   * organization pages (personal/profile channels never report). Those posts are still counted, with zeroes — so a zero for one of
   * these platforms means "not reported", not "measured zero". The same signal
   * appears per entry as `platformMetrics[].metricsSupported`.
   *
   * Support is also per-METRIC, not just per-platform. `metricSupport` maps each
   * platform in the window to the metric keys its API can actually report; every
   * other key is stored as 0 because the platform has no such field. X reports
   * impressions/likes/comments/shares/saves — saves via bookmarks (never
   * reach, clicks or video views); Bluesky and Mastodon report no impressions,
   * so their engagement rate is always 0 — though Bluesky does report `saves`,
   * via bookmarks; Pinterest reports no reach; YouTube reports no shares or
   * reach; Reddit reports likes (score), comments and shares (crossposts);
   * Discord reports likes (reaction counts) and comments (thread replies).
   * `supportedTotals` is the union across the window — a `total*` field whose key
   * is absent there should be shown as "not available", never as 0.
   * `partialTotals` maps a supported key to the platforms that do NOT report it,
   * and `conditionalMetrics` flags supported-but-permission-gated metrics
   * (Facebook's insights need `read_insights`). Each post's `platformMetrics`
   * entries carry the same list as `supportedMetrics`.
   *
   * `metricsDisabledChannels` lists channels whose metrics sync is switched off,
   * so their posts contribute zeroes. X is the only such platform today: its
   * reads are billed, so sync is opt-in per channel and runs at most weekly —
   * {@link refresh} will not produce X figures for a channel that hasn't opted in.
   *
   * Filters (`channelIds`, `platforms`, `labelIds`, `postFormat`, `mediaType`)
   * narrow every figure in the response; `compare: '1'` adds `previous` /
   * `previousWindow` for the equal-length window before `from` (available for
   * windows of 15 days or fewer). `byDay[]` carries every metric plus a
   * per-platform `platforms` breakdown; `byChannel[]` totals per channel;
   * each post carries `engagements`, `reach`, `postFormat`, `mediaType` and
   * `labels[]`.
   *
   * @example
   * ```ts
   * const data = await bp.analytics.engagement({
   *   from: '2026-04-01',
   *   to: '2026-04-08',
   *   platforms: 'x,linkedin',
   *   compare: '1',
   * });
   * ```
   */
  async engagement(params?: EngagementParams): Promise<any> {
    return this.http.get('/api/analytics/engagement', params as Record<string, string | number | undefined>);
  }

  /**
   * Refresh analytics data from connected platforms.
   *
   * @example
   * ```ts
   * await bp.analytics.refresh();
   * ```
   */
  async refresh(): Promise<any> {
    return this.http.post('/api/analytics/refresh');
  }

  /**
   * Get account-level metrics for a specific channel.
   *
   * @example
   * ```ts
   * const metrics = await bp.analytics.account({ channelId: 5 });
   * console.log(metrics.followers, metrics.following);
   * ```
   */
  async account(params: AccountMetricsParams = {}): Promise<any> {
    return this.http.get('/api/analytics/account', params as Record<string, string | number | undefined>);
  }

  /**
   * Every metrics snapshot stored for one post, per platform, oldest first —
   * the series behind a "since publish" trend. `post_metrics` is append-only
   * (one row per metrics sync), so the points follow the sync cadence: about
   * every 6 hours for most platforms, at most weekly for X channels that
   * opted in. Snapshots older than the 30-day retention floor are excluded.
   *
   * @example
   * ```ts
   * const { series } = await bp.analytics.postHistory({ postId: 123 });
   * for (const s of series) console.log(s.platform, s.points.map((p) => p.impressions));
   * ```
   */
  async postHistory(params: PostHistoryParams): Promise<any> {
    return this.http.get('/api/analytics/post-history', { postId: params.postId });
  }

  /**
   * Tracked-link performance: every bulkpubli.sh short link minted for a post
   * published in the window, with its click count. Clicks are measured by
   * BulkPublish's own redirector (bots and link previews excluded), so they
   * exist on every network. Totals sync every 15 minutes; referrer and country
   * splits are not stored. Empty for organizations without Link Tracking.
   *
   * @example
   * ```ts
   * const { totalClicks, links } = await bp.analytics.links({ from: '2026-08-01', to: '2026-08-31' });
   * ```
   */
  async links(params: LinksParams): Promise<any> {
    return this.http.get('/api/analytics/links', params as unknown as Record<string, string | number | undefined>);
  }
}
