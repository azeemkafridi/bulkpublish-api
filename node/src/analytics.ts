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
   * cannot report per-post metrics at all: Google Business, Telegram, Discord,
   * Reddit and Tumblr have no metrics API, and LinkedIn exposes share
   * statistics only for organization pages (personal/profile channels never
   * report). Those posts are still counted, with zeroes — so a zero for one of
   * these platforms means "not reported", not "measured zero". The same signal
   * appears per entry as `platformMetrics[].metricsSupported`.
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
