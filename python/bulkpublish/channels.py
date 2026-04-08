"""
Channels resource for the BulkPublish SDK.

Provides methods to list, inspect, and manage connected social-media channels.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Channel, ChannelHealth


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
            active: Filter by active status. ``True`` returns only active
                channels, ``False`` only inactive, ``None`` returns all.

        Returns:
            List of channel objects.

        Example::

            # All channels
            channels = bp.channels.list()

            # Only active channels
            active = bp.channels.list(active=True)
            print(f"{len(active)} active channels")
        """
        params: Dict[str, Any] = {}
        if active is not None:
            params["active"] = str(active).lower()
        return self._client._request("GET", "/api/channels", params=params)

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

    async def get(self, channel_id: str) -> Channel:
        """Get a channel — see :meth:`ChannelsResource.get` for full docs."""
        return await self._client._request("GET", f"/api/channels/{channel_id}")

    async def disconnect(self, channel_id: str) -> Dict[str, Any]:
        """Disconnect a channel — see :meth:`ChannelsResource.disconnect`."""
        return await self._client._request("DELETE", f"/api/channels/{channel_id}")

    async def health(self, channel_id: str) -> ChannelHealth:
        """Check channel health — see :meth:`ChannelsResource.health`."""
        return await self._client._request("GET", f"/api/channels/{channel_id}/health")
