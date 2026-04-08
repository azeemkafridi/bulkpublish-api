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
  groupBy?: 'day' | 'week' | 'month';
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
 * const engagement = await bp.analytics.engagement({ groupBy: 'day' });
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
   * @example
   * ```ts
   * const data = await bp.analytics.engagement({
   *   from: '2026-04-01',
   *   to: '2026-04-08',
   *   groupBy: 'day',
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
