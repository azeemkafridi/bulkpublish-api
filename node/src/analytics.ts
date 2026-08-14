import type { HttpClient } from './client.js';

export interface AnalyticsSummaryParams {
  from?: string;
  to?: string;
  channelId?: number;
}

export interface EngagementParams {
  from?: string;
  to?: string;
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
   * Sort field for `allPosts`. `linkClicks` sorts by bulkpubli.sh short-link
   * click count. Default: `'date'`.
   */
  sort?: 'date' | 'impressions' | 'likes' | 'comments' | 'shares' | 'linkClicks';
  /** Sort direction for `allPosts`. Default: `'desc'`. */
  order?: 'asc' | 'desc';
}

export interface AccountMetricsParams {
  channelId: number;
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
   * @example
   * ```ts
   * const data = await bp.analytics.engagement({
   *   from: '2026-04-01',
   *   to: '2026-04-08',
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
  async account(params: AccountMetricsParams): Promise<any> {
    return this.http.get('/api/analytics/account', { channelId: params.channelId });
  }
}
