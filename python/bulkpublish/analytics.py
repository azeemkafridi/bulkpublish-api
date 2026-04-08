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
    ) -> List[EngagementDataPoint]:
        """Get engagement time-series data.

        Args:
            from_date: ISO-8601 start date.
            to_date: ISO-8601 end date.
            channel_id: Limit to a specific channel.
            group_by: Grouping interval — ``"day"``, ``"week"``, or
                ``"month"``.

        Returns:
            List of data points, each with ``date``, ``impressions``,
            ``engagements``, ``clicks``, ``likes``, ``comments``, and
            ``shares``.

        Example::

            data = bp.analytics.engagement(
                from_date="2026-03-01",
                to_date="2026-04-01",
                group_by="week",
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
