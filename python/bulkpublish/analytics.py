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


def _account_params(
    channel_id: Optional[str],
    channel_ids: Optional[str],
    platforms: Optional[str],
    from_date: Optional[str],
    to_date: Optional[str],
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if channel_id is not None:
        params["channelId"] = channel_id
    if channel_ids is not None:
        params["channelIds"] = channel_ids
    if platforms is not None:
        params["platforms"] = platforms
    if from_date is not None:
        params["from"] = from_date
    if to_date is not None:
        params["to"] = to_date
    return params


def _links_params(
    from_date: str,
    to_date: str,
    channel_ids: Optional[str],
    platforms: Optional[str],
    label_ids: Optional[str],
    post_format: Optional[str],
    media_type: Optional[str],
) -> Dict[str, Any]:
    params: Dict[str, Any] = {"from": from_date, "to": to_date}
    if channel_ids is not None:
        params["channelIds"] = channel_ids
    if platforms is not None:
        params["platforms"] = platforms
    if label_ids is not None:
        params["labelIds"] = label_ids
    if post_format is not None:
        params["postFormat"] = post_format
    if media_type is not None:
        params["mediaType"] = media_type
    return params


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
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        label_ids: Optional[str] = None,
        post_format: Optional[str] = None,
        media_type: Optional[str] = None,
        compare: Optional[bool] = None,
    ) -> AnalyticsSummary:
        """Get an analytics summary for a date range.

        Args:
            from_date: ISO-8601 start date (e.g. ``"2026-04-01"``).
            to_date: ISO-8601 end date (e.g. ``"2026-04-08"``).
            channel_id: Legacy single-channel filter; same as ``channel_ids``.
            channel_ids: Comma-separated channel ids (``"12,15"``). Only
                post_platform rows on these channels count.
            platforms: Comma-separated platform keys (``"x,linkedin"``).
            label_ids: Comma-separated label ids; a post matches when it
                carries ANY of them.
            post_format: ``"post"`` or ``"thread"``.
            media_type: ``"text"`` (no media), ``"image"`` or ``"video"``,
                by the post's first media file.
            compare: Also compute the equal-length window immediately before
                ``from_date``. The response then carries ``previous`` and
                ``previousWindow`` (``{from, to, days, available}``);
                ``previous`` is ``None`` when the earlier window would reach
                past the 30-day retention floor — windows of 15 days or fewer.

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
        if channel_ids is not None:
            params["channelIds"] = channel_ids
        if platforms is not None:
            params["platforms"] = platforms
        if label_ids is not None:
            params["labelIds"] = label_ids
        if post_format is not None:
            params["postFormat"] = post_format
        if media_type is not None:
            params["mediaType"] = media_type
        if compare:
            params["compare"] = "1"
        return self._client._request("GET", "/api/analytics/summary", params=params)

    def engagement(
        self,
        *,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_id: Optional[str] = None,
        group_by: Optional[str] = None,
        top: Optional[bool] = None,
        sort: Optional[str] = None,
        order: Optional[str] = None,
        top_by: Optional[str] = None,
        top_order: Optional[str] = None,
        heatmap: Optional[bool] = None,
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        label_ids: Optional[str] = None,
        post_format: Optional[str] = None,
        media_type: Optional[str] = None,
        compare: Optional[bool] = None,
    ) -> List[EngagementDataPoint]:
        """Get engagement time-series data.

        Args:
            from_date: ISO-8601 start date.
            to_date: ISO-8601 end date.
            channel_id: Legacy single-channel filter; same as ``channel_ids``.
            channel_ids: Comma-separated channel ids (``"12,15"``). Only
                post_platform rows on these channels count.
            platforms: Comma-separated platform keys (``"x,linkedin"``).
            label_ids: Comma-separated label ids; a post matches when it
                carries ANY of them.
            post_format: ``"post"`` or ``"thread"``.
            media_type: ``"text"`` (no media), ``"image"`` or ``"video"``,
                by the post's first media file.
            compare: Also compute the equal-length window immediately before
                ``from_date``. The response then carries ``previous`` and
                ``previousWindow`` (``{from, to, days, available}``);
                ``previous`` is ``None`` when the earlier window would reach
                past the 30-day retention floor — windows of 15 days or fewer.
            top_by: Metric ``topPosts`` is ranked by — any ``sort`` value
                except ``"date"``. Defaults to ``"impressions"``.
            top_order: ``"desc"`` (default) for the best posts, ``"asc"`` for
                the worst.
            heatmap: Include ``postTimes`` — one ``{t, e, i}`` (publish
                instant, engagements, impressions) per published post_platform,
                for engagement-weighted best-time-to-post views.
            group_by: Deprecated and ignored by the server — ``byDay`` is
                always daily buckets, and passing ``"week"``/``"month"``
                silently returned daily data. Aggregate client-side.
            top: Return only the ranked ``topPosts`` leaderboard; ``allPosts``
                comes back empty.
            sort: Sort field for ``allPosts`` — ``"date"``, ``"impressions"``,
                ``"reach"``, ``"likes"``, ``"comments"``, ``"shares"``,
                ``"saves"``, ``"clicks"``, ``"videoViews"``, ``"linkClicks"``
                (bulkpubli.sh short-link click count), ``"engagements"``
                (likes + comments + shares + clicks) or ``"engagementRate"``.
                Defaults to ``"date"``.
            order: Sort direction for ``allPosts`` — ``"asc"`` or ``"desc"``.
                Defaults to ``"desc"``.

        Note:
            Figures come from the stored metrics snapshot, synced every 6 hours
            (or on demand via :meth:`refresh`) — not a live platform read. The
            response's ``unmeasuredPlatforms`` lists platforms that cannot
            report per-post metrics (Google Business and Telegram have no
            readable metrics API; Tumblr reports only an unsplittable note
            count; and LinkedIn personal/profile channels, since share
            statistics are organization-only). Their posts still count, with
            zeroes — a zero there means "not reported", not "measured zero".

            Support is per-METRIC too. ``metricSupport`` maps each platform in
            the window to the metric keys its API can report; every other key is
            a stored 0, not a measurement. X reports impressions/likes/
            comments/shares/saves — saves via bookmarks (never reach, clicks or
            video views); Bluesky and Mastodon report no impressions, so
            engagement rate is always 0; Pinterest reports no reach; YouTube
            reports no shares or reach; Reddit reports likes (score), comments
            and shares (crossposts); Discord reports likes (reaction counts)
            and comments (thread replies).
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
            ``engagements``, ``clicks``, ``likes``, ``comments``, ``shares``
            and ``linkClicks``.

            ``linkClicks`` (and the window-level ``totalLinkClicks``) counts
            clicks on bulkpubli.sh short links, measured by BulkPublish rather
            than reported by the platform. It is deliberately NOT folded into
            ``clicks``/``totalClicks`` — one visit can register in both, so
            adding them double-counts. Bot and link-preview traffic is
            excluded, and it is 0 for organizations without Link Tracking
            enabled.

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
        if sort is not None:
            params["sort"] = sort
        if order is not None:
            params["order"] = order
        if top_by is not None:
            params["topBy"] = top_by
        if top_order is not None:
            params["topOrder"] = top_order
        if heatmap:
            params["heatmap"] = "1"
        if channel_ids is not None:
            params["channelIds"] = channel_ids
        if platforms is not None:
            params["platforms"] = platforms
        if label_ids is not None:
            params["labelIds"] = label_ids
        if post_format is not None:
            params["postFormat"] = post_format
        if media_type is not None:
            params["mediaType"] = media_type
        if compare:
            params["compare"] = "1"
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

    def account(
        self,
        *,
        channel_id: Optional[str] = None,
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> AccountMetrics:
        """Get account-level metrics for a channel.

        Args:
            channel_id: Legacy single-channel filter; same as ``channel_ids``.
            channel_ids: Comma-separated channel ids.
            platforms: Comma-separated platform keys.
            from_date: Start date (YYYY-MM-DD), default 30 days ago; clamped
                to at most 30 days before ``to_date``.
            to_date: End date (YYYY-MM-DD), default today.

        Returns:
            Account metrics dict with ``followers``, ``following``,
            ``totalPosts``, and ``engagementRate``.

        Example::

            metrics = bp.analytics.account(channel_id="ch_abc123")
            print(f"Followers: {metrics['followers']}")
        """
        params = _account_params(channel_id, channel_ids, platforms, from_date, to_date)
        return self._client._request("GET", "/api/analytics/account", params=params)

    def post_history(self, post_id: int) -> Dict[str, Any]:
        """Every stored metrics snapshot for one post, per platform, oldest first.

        ``post_metrics`` is append-only (one row per metrics sync), so this is
        the trend since publish — about one point per 6-hour sync, weekly for
        opted-in X channels. Snapshots older than the 30-day retention floor
        are excluded.

        Returns:
            ``{"postId", "publishedAt", "series": [{"postPlatformId",
            "platform", "channelId", "accountName", "supportedMetrics",
            "metricsSupported", "points": [{"fetchedAt", "impressions",
            "reach", "likes", "comments", "shares", "saves", "clicks",
            "videoViews", "engagementRate"}]}]}``. A series whose
            ``metricsSupported`` is ``False`` holds stored zeros, not
            measurements.

        Example::

            history = bp.analytics.post_history(123)
            for s in history["series"]:
                print(s["platform"], [p["impressions"] for p in s["points"]])
        """
        return self._client._request("GET", "/api/analytics/post-history", params={"postId": post_id})

    def links(
        self,
        *,
        from_date: str,
        to_date: str,
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        label_ids: Optional[str] = None,
        post_format: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Tracked bulkpubli.sh links for posts published in the window.

        Clicks are measured by BulkPublish's own redirector (bots and link
        previews excluded), so they exist on every network. Totals sync every
        15 minutes; referrer and country splits are not stored. Empty for
        organizations without Link Tracking.

        Returns:
            ``{"from", "to", "totalClicks", "totalLinks", "links": [{"id",
            "shortUrl", "code", "originalUrl", "finalUrl", "destinationHost",
            "clicks", "lastClickAt", "createdAt", "platform", "channelId",
            "accountName", "postId", "postContent", "publishedAt"}]}``

        Example::

            data = bp.analytics.links(from_date="2026-08-01", to_date="2026-08-31")
            print(data["totalClicks"])
        """
        params = _links_params(from_date, to_date, channel_ids, platforms, label_ids, post_format, media_type)
        return self._client._request("GET", "/api/analytics/links", params=params)


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
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        label_ids: Optional[str] = None,
        post_format: Optional[str] = None,
        media_type: Optional[str] = None,
        compare: Optional[bool] = None,
    ) -> AnalyticsSummary:
        """Get analytics summary — see :meth:`AnalyticsResource.summary`."""
        params: Dict[str, Any] = {}
        if from_date is not None:
            params["from"] = from_date
        if to_date is not None:
            params["to"] = to_date
        if channel_id is not None:
            params["channelId"] = channel_id
        if channel_ids is not None:
            params["channelIds"] = channel_ids
        if platforms is not None:
            params["platforms"] = platforms
        if label_ids is not None:
            params["labelIds"] = label_ids
        if post_format is not None:
            params["postFormat"] = post_format
        if media_type is not None:
            params["mediaType"] = media_type
        if compare:
            params["compare"] = "1"
        return await self._client._request("GET", "/api/analytics/summary", params=params)

    async def engagement(
        self,
        *,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        channel_id: Optional[str] = None,
        group_by: Optional[str] = None,
        top: Optional[bool] = None,
        sort: Optional[str] = None,
        order: Optional[str] = None,
        top_by: Optional[str] = None,
        top_order: Optional[str] = None,
        heatmap: Optional[bool] = None,
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        label_ids: Optional[str] = None,
        post_format: Optional[str] = None,
        media_type: Optional[str] = None,
        compare: Optional[bool] = None,
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
        if sort is not None:
            params["sort"] = sort
        if order is not None:
            params["order"] = order
        if top_by is not None:
            params["topBy"] = top_by
        if top_order is not None:
            params["topOrder"] = top_order
        if heatmap:
            params["heatmap"] = "1"
        if channel_ids is not None:
            params["channelIds"] = channel_ids
        if platforms is not None:
            params["platforms"] = platforms
        if label_ids is not None:
            params["labelIds"] = label_ids
        if post_format is not None:
            params["postFormat"] = post_format
        if media_type is not None:
            params["mediaType"] = media_type
        if compare:
            params["compare"] = "1"
        return await self._client._request("GET", "/api/analytics/engagement", params=params)

    async def refresh(self) -> Dict[str, Any]:
        """Refresh analytics — see :meth:`AnalyticsResource.refresh`."""
        return await self._client._request("POST", "/api/analytics/refresh")

    async def account(
        self,
        *,
        channel_id: Optional[str] = None,
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
    ) -> AccountMetrics:
        """Get account metrics — see :meth:`AnalyticsResource.account`."""
        params = _account_params(channel_id, channel_ids, platforms, from_date, to_date)
        return await self._client._request("GET", "/api/analytics/account", params=params)

    async def post_history(self, post_id: int) -> Dict[str, Any]:
        """Per-post metric history — see :meth:`AnalyticsResource.post_history`."""
        return await self._client._request("GET", "/api/analytics/post-history", params={"postId": post_id})

    async def links(
        self,
        *,
        from_date: str,
        to_date: str,
        channel_ids: Optional[str] = None,
        platforms: Optional[str] = None,
        label_ids: Optional[str] = None,
        post_format: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Tracked-link performance — see :meth:`AnalyticsResource.links`."""
        params = _links_params(from_date, to_date, channel_ids, platforms, label_ids, post_format, media_type)
        return await self._client._request("GET", "/api/analytics/links", params=params)
