"""
Channels resource for the BulkPublish SDK.

Provides methods to list, inspect, and manage connected social-media channels.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Channel, ChannelHealth, ChannelOptions, PlatformAvailability


class ChannelsResource:
    """Operations on connected social-media channels.

    Access via ``client.channels``:

    Example::

        bp = BulkPublish("bp_key")
        channels = bp.channels.list()
        for ch in channels:
            print(ch["platform"], ch["name"])
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self, *, active: Optional[bool] = None) -> List[Channel]:
        """List all connected channels.

        Args:
            active: Filter by active status. ``True`` (or ``None``, the
                server default) returns only active channels. ``False``
                returns every active channel plus up to 100 inactive
                (disconnected) ones, most recently updated first.

        Returns:
            The ``GET /api/channels`` envelope, which carries ``channels`` and,
            since 2026-09, ``capabilities`` (a :class:`MemberCapabilities` for
            the member whose key made the request).

            Note the annotation says ``List[Channel]`` and the response is the
            envelope. That mismatch predates ``capabilities`` and is shared by
            ``labels.list`` and ``schedules.list``; it is left alone here
            because changing it is a breaking change across the SDK rather than
            a docs fix.

        Example::

            # All channels
            channels = bp.channels.list()["channels"]

            # Only active channels
            active = bp.channels.list(active=True)
            print(f"{len(active)} active channels")
        """
        params: Dict[str, Any] = {}
        if active is not None:
            params["active"] = str(active).lower()
        return self._client._request("GET", "/api/channels", params=params)

    def list_platforms(self) -> List[PlatformAvailability]:
        """List every supported platform and its current availability.

        Check this before offering a connect option or scheduling a post: a
        platform in state ``off`` rejects post creation with a 403
        ``PLATFORM_DISABLED`` error and holds already-scheduled posts until it is
        re-enabled, while ``connect_off`` blocks new connections but lets
        existing channels keep publishing.

        Disabled platforms are still included, with ``enabled`` False and a
        ``reason``.

        A platform may also carry ``variants`` — sub-platforms gated separately
        because the vendor reviews them as a separate app. LinkedIn reports
        ``variants["organization"]`` for company pages; the platform-level state
        describes personal profiles.

        Returns:
            List of platform availability objects.

        Example::

            for p in bp.channels.list_platforms():
                if not p["canPublish"]:
                    print(f"{p['displayName']} unavailable: {p['message']}")
        """
        res = self._client._request("GET", "/api/platforms")
        return res.get("platforms", []) if isinstance(res, dict) else res

    def get(self, channel_id: str) -> Channel:
        """Get a single channel by ID.

        Args:
            channel_id: The channel's unique identifier.

        Returns:
            The full channel object.

        Raises:
            NotFoundError: If the channel does not exist.

        Example::

            channel = bp.channels.get("ch_abc123")
            print(channel["platform"], channel["name"])
        """
        return self._client._request("GET", f"/api/channels/{channel_id}")

    def disconnect(self, channel_id: str) -> Dict[str, Any]:
        """Disconnect (remove) a channel.

        This revokes the OAuth connection and removes the channel from your
        account. Existing posts targeting this channel are not deleted.

        Args:
            channel_id: The channel's unique identifier.

        Returns:
            Confirmation dict.

        Raises:
            NotFoundError: If the channel does not exist.

        Example::

            bp.channels.disconnect("ch_abc123")
        """
        return self._client._request("DELETE", f"/api/channels/{channel_id}")

    def update(
        self,
        channel_id: str,
        *,
        metrics_sync_enabled: Optional[bool] = None,
        inbox_sync_enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Update a channel's per-channel opt-ins (X only today).

        X bills per read, so each kind of read is off by default and switched
        on per channel by its own field: ``metrics_sync_enabled`` for analytics
        and post likers, ``inbox_sync_enabled`` for direct messages and replies
        to the channel's posts. A value of ``inbox_sync_enabled`` set before
        2026-10-06 is not carried over; send it again to turn those reads back
        on. Fields left as ``None`` are not sent.
        Requires a role that can manage channels; viewers get 403.

        Example::

            bp.channels.update("12", metrics_sync_enabled=True)
        """
        body: Dict[str, Any] = {}
        if metrics_sync_enabled is not None:
            body["metricsSyncEnabled"] = metrics_sync_enabled
        if inbox_sync_enabled is not None:
            body["inboxSyncEnabled"] = inbox_sync_enabled
        return self._client._request("PATCH", f"/api/channels/{channel_id}", json=body)

    def health(self, channel_id: str) -> ChannelHealth:
        """Check the health of a connected channel.

        Verifies that the OAuth token is still valid and the platform is
        reachable.

        Args:
            channel_id: The channel's unique identifier.

        Returns:
            Health status dict with ``healthy``, ``lastChecked``, and optional
            ``error`` keys.

        Example::

            health = bp.channels.health("ch_abc123")
            if not health["healthy"]:
                print(f"Channel unhealthy: {health.get('error')}")
        """
        return self._client._request("GET", f"/api/channels/{channel_id}/health")

    def options(
        self,
        channel_id: str,
        *,
        q: Optional[str] = None,
        board_id: Optional[str] = None,
        audio_type: Optional[str] = None,
        probe: bool = False,
    ) -> ChannelOptions:
        """Get a channel's platform options, keyed by ``type``.

        Pinterest boards (or a board's sections with ``board_id``), YouTube
        playlists, Tumblr blogs, Discord text channels, Threads places
        (``q``), TikTok ``creator_info`` and Instagram music (``audio``). A
        platform without options answers ``{"type": None, "items": []}``.

        Instagram: with no ``q`` it lists trending tracks; ``q`` searches, and
        ``audio_type="original_sound"`` searches original sounds instead of
        music. Pass an item's ``id`` as ``platformSpecific.instagram.audio.audioId``.
        ``probe=True`` only reports whether the account can add music, without
        searching. Music needs an account connected through Facebook: any
        other Instagram channel answers
        ``{"type": "audio", "unavailable": "facebook_required", "items": []}``,
        and ``unavailable: "disabled"`` means music is not available for this
        workspace right now.

        Args:
            channel_id: The channel's unique identifier.
            q: Search term. Threads: place search. Instagram: track search
                (omitted lists trending tracks).
            board_id: Pinterest only: numeric board ID; returns that board's
                sections instead of the boards.
            audio_type: Instagram only: ``"music"`` (default) or
                ``"original_sound"``. Any other value is read as ``"music"``.
            probe: Instagram only: report availability without searching.

        Example::

            res = bp.channels.options("7", q="summer")
            if res["type"] == "audio" and not res.get("unavailable") and res["items"]:
                track = res["items"][0]
                bp.posts.create(
                    channels=[{"channelId": 7, "platform": "instagram"}],
                    content="New Reel",
                    media_files=[video_id],
                    post_type_overrides={"instagram": "reel"},
                    platform_specific={"instagram": {"audio": {"audioId": track["id"], "audioVolume": 60}}},
                )
        """
        return self._client._request(
            "GET",
            f"/api/channels/{channel_id}/options",
            params=_options_params(q, board_id, audio_type, probe),
        )


def _options_params(
    q: Optional[str], board_id: Optional[str], audio_type: Optional[str], probe: bool
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if q is not None:
        params["q"] = q
    if board_id is not None:
        params["boardId"] = board_id
    if audio_type is not None:
        params["audioType"] = audio_type
    if probe:
        params["probe"] = "1"
    return params


class AsyncChannelsResource:
    """Async version of :class:`ChannelsResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            channels = await bp.channels.list(active=True)
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self, *, active: Optional[bool] = None) -> List[Channel]:
        """List channels — see :meth:`ChannelsResource.list` for full docs."""
        params: Dict[str, Any] = {}
        if active is not None:
            params["active"] = str(active).lower()
        return await self._client._request("GET", "/api/channels", params=params)

    async def list_platforms(self) -> List[PlatformAvailability]:
        """List every supported platform and its current availability.

        Async counterpart of :meth:`ChannelsResource.list_platforms`.
        """
        res = await self._client._request("GET", "/api/platforms")
        return res.get("platforms", []) if isinstance(res, dict) else res

    async def get(self, channel_id: str) -> Channel:
        """Get a channel — see :meth:`ChannelsResource.get` for full docs."""
        return await self._client._request("GET", f"/api/channels/{channel_id}")

    async def disconnect(self, channel_id: str) -> Dict[str, Any]:
        """Disconnect a channel — see :meth:`ChannelsResource.disconnect`."""
        return await self._client._request("DELETE", f"/api/channels/{channel_id}")

    async def update(
        self,
        channel_id: str,
        *,
        metrics_sync_enabled: Optional[bool] = None,
        inbox_sync_enabled: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """Update channel opt-ins — see :meth:`ChannelsResource.update`."""
        body: Dict[str, Any] = {}
        if metrics_sync_enabled is not None:
            body["metricsSyncEnabled"] = metrics_sync_enabled
        if inbox_sync_enabled is not None:
            body["inboxSyncEnabled"] = inbox_sync_enabled
        return await self._client._request("PATCH", f"/api/channels/{channel_id}", json=body)

    async def health(self, channel_id: str) -> ChannelHealth:
        """Check channel health — see :meth:`ChannelsResource.health`."""
        return await self._client._request("GET", f"/api/channels/{channel_id}/health")

    async def options(
        self,
        channel_id: str,
        *,
        q: Optional[str] = None,
        board_id: Optional[str] = None,
        audio_type: Optional[str] = None,
        probe: bool = False,
    ) -> ChannelOptions:
        """Get channel options — see :meth:`ChannelsResource.options`."""
        return await self._client._request(
            "GET",
            f"/api/channels/{channel_id}/options",
            params=_options_params(q, board_id, audio_type, probe),
        )
