"""
Analytics resource for the BulkPublish SDK.

Provides methods to retrieve analytics summaries, engagement time series,
account-level metrics, and trigger data refreshes.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import AccountMetrics, AnalyticsSummary, EngagementDataPoint


class AnalyticsResource:
    """Operations on analytics data.

    Access via ``client.analytics``:

    Example::

        bp = BulkPublish("bp_key")
        summary = bp.analytics.summary(from_date="2026-04-01", to_date="2026-04-08")
        print(f"Total posts: {summary['totalPosts']}")
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def summary(
        self,
        *,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_id: Optional[str] = None,
    ) -> AnalyticsSummary:
        """Get an analytics summary for a date range.

        Args:
            from_date: ISO-8601 start date (e.g. ``"2026-04-01"``).
            to_date: ISO-8601 end date (e.g. ``"2026-04-08"``).
            channel_id: Limit to a specific channel.

        Returns:
            Summary dict with ``totalPosts``, ``totalImpressions``,
            ``totalEngagements``, ``totalClicks``, ``avgEngagementRate``,
            and ``topPost``.

        Example::

            summary = bp.analytics.summary(
                from_date="2026-04-01",
                to_date="2026-04-08",
            )
            print(f"Impressions: {summary['totalImpressions']}")
            print(f"Engagement rate: {summary['avgEngagementRate']:.1%}")
        """
        params: Dict[str, Any] = {}
        if from_date is not None:
            params["from"] = from_date
        if to_date is not None:
            params["to"] = to_date
        if channel_id is not None:
            params["channelId"] = channel_id
        return self._client._request("GET", "/api/analytics/summary", params=params)

    def engagement(
        self,
        *,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_id: Optional[str] = None,
        group_by: Optional[str] = None,
        top: Optional[bool] = None,
    ) -> List[EngagementDataPoint]:
        """Get engagement time-series data.

        Args:
            from_date: ISO-8601 start date.
            to_date: ISO-8601 end date.
            channel_id: Limit to a specific channel.
            group_by: Deprecated and ignored by the server — ``byDay`` is
                always daily buckets, and passing ``"week"``/``"month"``
                silently returned daily data. Aggregate client-side.
            top: Return only the ranked ``topPosts`` leaderboard; ``allPosts``
                comes back empty.

        Note:
            Figures come from the stored metrics snapshot, synced every 6 hours
            (or on demand via :meth:`refresh`) — not a live platform read. The
            response's ``unmeasuredPlatforms`` lists platforms that cannot
            report per-post metrics at all (Google Business, Telegram, Discord,
            Reddit, Tumblr; and LinkedIn personal/profile channels, since share
            statistics are organization-only). Their posts still count, with
            zeroes — a zero there means "not reported", not "measured zero".

            Support is per-METRIC too. ``metricSupport`` maps each platform in
            the window to the metric keys its API can report; every other key is
            a stored 0, not a measurement. X reports impressions/likes/comments/
            shares only (never reach, saves, clicks or video views); Bluesky and
            Mastodon report no impressions, so engagement rate is always 0;
            Pinterest reports no reach; YouTube reports no shares or reach.
            ``supportedTotals`` is the union across the window — render a
            ``total*`` field whose key is missing there as "not available", never
            as 0. ``partialTotals`` maps a supported key to the platforms that do
            not report it, and ``conditionalMetrics`` flags supported-but-
            permission-gated metrics (Facebook insights need ``read_insights``).

            ``metricsDisabledChannels`` lists channels whose metrics sync is off,
            so their posts contribute zeroes. X is the only one today: its reads
            are billed, so sync is opt-in per channel and runs at most weekly —
            ``refresh()`` will not produce X figures for a channel that has not
            opted in.

        Returns:
            List of data points, each with ``date``, ``impressions``,
            ``engagements``, ``clicks``, ``likes``, ``comments``, and
            ``shares``.

        Example::

            data = bp.analytics.engagement(
                from_date="2026-03-01",
                to_date="2026-04-01",
            )
            for point in data:
                print(f"{point['date']}: {point['engagements']} engagements")
        """
        params: Dict[str, Any] = {}
        if from_date is not None:
            params["from"] = from_date
        if to_date is not None:
            params["to"] = to_date
        if channel_id is not None:
            params["channelId"] = channel_id
        if group_by is not None:
            params["groupBy"] = group_by
        if top:
            params["top"] = "1"
        return self._client._request("GET", "/api/analytics/engagement", params=params)

    def refresh(self) -> Dict[str, Any]:
        """Trigger an analytics data refresh.

        Fetches the latest metrics from all connected platforms.  This is
        an asynchronous operation — results may take a few minutes.

        Returns:
            Confirmation dict.

        Example::

            bp.analytics.refresh()
            # Wait, then fetch updated summary
            import time
            time.sleep(60)
            summary = bp.analytics.summary()
        """
        return self._client._request("POST", "/api/analytics/refresh")

    def account(self, *, channel_id: Optional[str] = None) -> AccountMetrics:
        """Get account-level metrics for a channel.

        Args:
            channel_id: The channel to get metrics for.

        Returns:
            Account metrics dict with ``followers``, ``following``,
            ``totalPosts``, and ``engagementRate``.

        Example::

            metrics = bp.analytics.account(channel_id="ch_abc123")
            print(f"Followers: {metrics['followers']}")
        """
        params: Dict[str, Any] = {}
        if channel_id is not None:
            params["channelId"] = channel_id
        return self._client._request("GET", "/api/analytics/account", params=params)


class AsyncAnalyticsResource:
    """Async version of :class:`AnalyticsResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            summary = await bp.analytics.summary(from_date="2026-04-01")
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def summary(
        self,
        *,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_id: Optional[str] = None,
    ) -> AnalyticsSummary:
        """Get analytics summary — see :meth:`AnalyticsResource.summary`."""
        params: Dict[str, Any] = {}
        if from_date is not None:
            params["from"] = from_date
        if to_date is not None:
            params["to"] = to_date
        if channel_id is not None:
            params["channelId"] = channel_id
        return await self._client._request("GET", "/api/analytics/summary", params=params)

    async def engagement(
        self,
        *,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_id: Optional[str] = None,
        group_by: Optional[str] = None,
        top: Optional[bool] = None,
    ) -> List[EngagementDataPoint]:
        """Get engagement data — see :meth:`AnalyticsResource.engagement`."""
        params: Dict[str, Any] = {}
        if from_date is not None:
            params["from"] = from_date
        if to_date is not None:
            params["to"] = to_date
        if channel_id is not None:
            params["channelId"] = channel_id
        if group_by is not None:
            params["groupBy"] = group_by
        if top:
            params["top"] = "1"
        return await self._client._request("GET", "/api/analytics/engagement", params=params)

    async def refresh(self) -> Dict[str, Any]:
        """Refresh analytics — see :meth:`AnalyticsResource.refresh`."""
        return await self._client._request("POST", "/api/analytics/refresh")

    async def account(self, *, channel_id: Optional[str] = None) -> AccountMetrics:
        """Get account metrics — see :meth:`AnalyticsResource.account`."""
        params: Dict[str, Any] = {}
        if channel_id is not None:
            params["channelId"] = channel_id
        return await self._client._request("GET", "/api/analytics/account", params=params)
