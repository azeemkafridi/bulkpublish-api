"""
Channel Sets resource for the BulkPublish SDK.

Channel sets are saved channel groupings for one-click multi-channel
targeting. An organization can have up to 50 sets; names are unique per
organization (duplicates fail with a 409 and error code ``DUPLICATE_NAME``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import ChannelSet


class ChannelSetsResource:
    """Operations on channel sets (saved channel groups).

    Access via ``client.channel_sets``:

    Example::

        bp = BulkPublish("bp_key")
        sets = bp.channel_sets.list()
        s = bp.channel_sets.create(name="All socials", channel_ids=[1, 2, 3])
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[ChannelSet]:
        """List all channel sets in the current organization, ordered by name."""
        return self._client._request("GET", "/api/channel-sets")

    def create(self, *, name: str, channel_ids: List[int]) -> ChannelSet:
        """Create a channel set.

        Args:
            name: Set name (max 100 chars, unique per organization).
            channel_ids: IDs of channels in your organization (at least 1).

        Returns:
            The newly created channel set.

        Raises:
            ValidationError: If the name or channel IDs are invalid, or the
                organization already has 50 sets.
            BulkPublishError: 409 with code ``DUPLICATE_NAME`` if a set with
                the same name already exists.

        Example::

            s = bp.channel_sets.create(name="All socials", channel_ids=[1, 2])
        """
        return self._client._request(
            "POST", "/api/channel-sets", json={"name": name, "channelIds": channel_ids}
        )

    def update(
        self,
        set_id: int,
        *,
        name: Optional[str] = None,
        channel_ids: Optional[List[int]] = None,
    ) -> ChannelSet:
        """Update a channel set (partial — at least one field is required).

        Args:
            set_id: The channel set ID.
            name: New set name (max 100 chars, unique per organization).
            channel_ids: Replacement channel IDs (at least 1).

        Returns:
            The updated channel set.

        Raises:
            NotFoundError: If the set does not exist.
            BulkPublishError: 409 with code ``DUPLICATE_NAME`` on a name clash.
        """
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if channel_ids is not None:
            body["channelIds"] = channel_ids
        return self._client._request("PUT", f"/api/channel-sets/{set_id}", json=body)

    def delete(self, set_id: int) -> Dict[str, Any]:
        """Delete a channel set.

        Args:
            set_id: The channel set ID.

        Raises:
            NotFoundError: If the set does not exist.
        """
        return self._client._request("DELETE", f"/api/channel-sets/{set_id}")


class AsyncChannelSetsResource:
    """Async version of :class:`ChannelSetsResource`.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            sets = await bp.channel_sets.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[ChannelSet]:
        """List channel sets — see :meth:`ChannelSetsResource.list`."""
        return await self._client._request("GET", "/api/channel-sets")

    async def create(self, *, name: str, channel_ids: List[int]) -> ChannelSet:
        """Create a channel set — see :meth:`ChannelSetsResource.create`."""
        return await self._client._request(
            "POST", "/api/channel-sets", json={"name": name, "channelIds": channel_ids}
        )

    async def update(
        self,
        set_id: int,
        *,
        name: Optional[str] = None,
        channel_ids: Optional[List[int]] = None,
    ) -> ChannelSet:
        """Update a channel set — see :meth:`ChannelSetsResource.update`."""
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if channel_ids is not None:
            body["channelIds"] = channel_ids
        return await self._client._request(
            "PUT", f"/api/channel-sets/{set_id}", json=body
        )

    async def delete(self, set_id: int) -> Dict[str, Any]:
        """Delete a channel set — see :meth:`ChannelSetsResource.delete`."""
        return await self._client._request("DELETE", f"/api/channel-sets/{set_id}")
