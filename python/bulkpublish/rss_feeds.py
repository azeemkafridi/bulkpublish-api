"""
RSS Autopost resource for the BulkPublish SDK.

RSS/Atom feeds are polled every 15 minutes; new items automatically become
posts on the chosen channels. An organization can have up to 20 feeds.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import RssFeed, RssFieldMapping


class RssFeedsResource:
    """Operations on RSS autopost feeds.

    Access via ``client.rss_feeds``:

    Example::

        bp = BulkPublish("bp_key")
        feed = bp.rss_feeds.create(
            name="Company blog",
            feed_url="https://example.com/rss.xml",
            channel_ids=[1, 2],
        )  # mode defaults to "draft"
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[RssFeed]:
        """List all RSS feeds in the current organization, ordered by name."""
        return self._client._request("GET", "/api/rss-feeds")

    def create(
        self,
        *,
        name: str,
        feed_url: str,
        channel_ids: List[int],
        mode: Optional[str] = None,
        field_mapping: Optional[RssFieldMapping] = None,
        require_approval: Optional[bool] = None,
    ) -> RssFeed:
        """Add an RSS feed.

        Args:
            name: Feed name (max 100 chars).
            feed_url: Public RSS 2.0 or Atom feed URL (server-validated as
                reachable).
            channel_ids: IDs of channels new items are posted to (at least 1).
            mode: ``"draft"`` (new items become draft posts for review — the
                default) or ``"publish"`` (auto-published).
            field_mapping: How each item becomes a post (caption template,
                media selection, truncation, hashtags, per-channel overrides —
                see :class:`~bulkpublish.types.RssFieldMapping`). Omit for the
                built-in default (``"{title}\n\n{link}"``, no media).
            require_approval: Hold items auto-published from this feed for
                team approval — each generated post lands with
                ``approvalStatus: "pending"`` and waits for
                ``bp.posts.approve(post_id)``. Only meaningful when ``mode``
                is ``"publish"``: draft items never publish on their own, and
                a feed force-demoted to draft by the plan gate stays ungated.
                Defaults to False.

        Returns:
            The newly created feed.

        Raises:
            ValidationError: If the input is invalid or the organization
                already has 20 feeds.

        Example::

            feed = bp.rss_feeds.create(
                name="Blog", feed_url="https://example.com/rss.xml",
                channel_ids=[1], mode="publish",
            )
        """
        body: Dict[str, Any] = {
            "name": name,
            "feedUrl": feed_url,
            "channelIds": channel_ids,
        }
        if mode is not None:
            body["mode"] = mode
        if field_mapping is not None:
            body["fieldMapping"] = field_mapping
        if require_approval is not None:
            body["requireApproval"] = require_approval
        return self._client._request("POST", "/api/rss-feeds", json=body)

    def update(
        self,
        feed_id: int,
        *,
        name: Optional[str] = None,
        feed_url: Optional[str] = None,
        channel_ids: Optional[List[int]] = None,
        mode: Optional[str] = None,
        field_mapping: Optional[RssFieldMapping] = None,
        clear_field_mapping: bool = False,
        enabled: Optional[bool] = None,
        require_approval: Optional[bool] = None,
    ) -> RssFeed:
        """Update an RSS feed (partial update).

        Note:
            Changing ``feed_url`` re-baselines the feed — its check state
            resets and only items published after the change are posted, so
            the new feed's backlog is not flooded onto your channels.

        Args:
            feed_id: The feed ID.
            name: New feed name.
            feed_url: New feed URL (see the re-baseline note above).
            channel_ids: Replacement channel IDs (at least 1).
            mode: ``"draft"`` or ``"publish"``.
            field_mapping: New field mapping (see
                :class:`~bulkpublish.types.RssFieldMapping`).
            clear_field_mapping: Set True to clear the mapping back to the
                built-in default (sends ``fieldMapping: null``).
            enabled: Enable or disable polling of this feed.
            require_approval: Hold items auto-published from this feed for
                team approval — each generated post lands with
                ``approvalStatus: "pending"`` and waits for
                ``bp.posts.approve(post_id)``. Only meaningful when ``mode``
                is ``"publish"``: draft items never publish on their own, and
                a feed force-demoted to draft by the plan gate stays ungated.
                Defaults to False.
                Toggling it affects future items only.

        Raises:
            NotFoundError: If the feed does not exist.
        """
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if feed_url is not None:
            body["feedUrl"] = feed_url
        if channel_ids is not None:
            body["channelIds"] = channel_ids
        if mode is not None:
            body["mode"] = mode
        if clear_field_mapping:
            body["fieldMapping"] = None
        elif field_mapping is not None:
            body["fieldMapping"] = field_mapping
        if enabled is not None:
            body["enabled"] = enabled
        if require_approval is not None:
            body["requireApproval"] = require_approval
        return self._client._request("PUT", f"/api/rss-feeds/{feed_id}", json=body)

    def delete(self, feed_id: int) -> Dict[str, Any]:
        """Delete an RSS feed.

        Args:
            feed_id: The feed ID.

        Raises:
            NotFoundError: If the feed does not exist.
        """
        return self._client._request("DELETE", f"/api/rss-feeds/{feed_id}")


class AsyncRssFeedsResource:
    """Async version of :class:`RssFeedsResource`.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            feeds = await bp.rss_feeds.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[RssFeed]:
        """List RSS feeds — see :meth:`RssFeedsResource.list`."""
        return await self._client._request("GET", "/api/rss-feeds")

    async def create(
        self,
        *,
        name: str,
        feed_url: str,
        channel_ids: List[int],
        mode: Optional[str] = None,
        field_mapping: Optional[RssFieldMapping] = None,
        require_approval: Optional[bool] = None,
    ) -> RssFeed:
        """Add an RSS feed — see :meth:`RssFeedsResource.create`."""
        body: Dict[str, Any] = {
            "name": name,
            "feedUrl": feed_url,
            "channelIds": channel_ids,
        }
        if mode is not None:
            body["mode"] = mode
        if field_mapping is not None:
            body["fieldMapping"] = field_mapping
        if require_approval is not None:
            body["requireApproval"] = require_approval
        return await self._client._request("POST", "/api/rss-feeds", json=body)

    async def update(
        self,
        feed_id: int,
        *,
        name: Optional[str] = None,
        feed_url: Optional[str] = None,
        channel_ids: Optional[List[int]] = None,
        mode: Optional[str] = None,
        field_mapping: Optional[RssFieldMapping] = None,
        clear_field_mapping: bool = False,
        enabled: Optional[bool] = None,
        require_approval: Optional[bool] = None,
    ) -> RssFeed:
        """Update an RSS feed — see :meth:`RssFeedsResource.update`."""
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if feed_url is not None:
            body["feedUrl"] = feed_url
        if channel_ids is not None:
            body["channelIds"] = channel_ids
        if mode is not None:
            body["mode"] = mode
        if clear_field_mapping:
            body["fieldMapping"] = None
        elif field_mapping is not None:
            body["fieldMapping"] = field_mapping
        if enabled is not None:
            body["enabled"] = enabled
        if require_approval is not None:
            body["requireApproval"] = require_approval
        return await self._client._request(
            "PUT", f"/api/rss-feeds/{feed_id}", json=body
        )

    async def delete(self, feed_id: int) -> Dict[str, Any]:
        """Delete an RSS feed — see :meth:`RssFeedsResource.delete`."""
        return await self._client._request("DELETE", f"/api/rss-feeds/{feed_id}")
