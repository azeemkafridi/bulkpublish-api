"""
Hashtag groups resource for the BulkPublish SDK.

A hashtag group is a named set of hashtags the composer can drop into a post
in one click. Groups are organization-wide.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import HashtagGroup


class HashtagGroupsResource:
    """Operations on saved hashtag groups.

    Access via ``client.hashtag_groups``:

    Example::

        bp = BulkPublish("bp_key")
        group = bp.hashtag_groups.create(name="Launch", hashtags=["launch", "#newproduct"])
        for g in bp.hashtag_groups.list():
            print(g["name"], " ".join(g["hashtags"]))
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[HashtagGroup]:
        """List every group in the organization, sorted by name."""
        return self._client._request("GET", "/api/hashtag-groups")["groups"]

    def get(self, group_id: int) -> HashtagGroup:
        """Get one group by ID."""
        return self._client._request("GET", f"/api/hashtag-groups/{group_id}")["group"]

    def create(self, *, name: str, hashtags: List[str]) -> HashtagGroup:
        """Create a group.

        Args:
            name: 1-100 characters, unique per organization (case-insensitive).
            hashtags: 1-30 hashtags, with or without the leading ``#``. Letters,
                digits and underscores only; duplicates are dropped.

        Raises:
            ValidationError: On a bad name or hashtag, or past 100 groups.
            ConflictError: If a group with the same name exists.
        """
        return self._client._request(
            "POST", "/api/hashtag-groups", json={"name": name, "hashtags": hashtags}
        )["group"]

    def update(
        self,
        group_id: int,
        *,
        name: Optional[str] = None,
        hashtags: Optional[List[str]] = None,
    ) -> HashtagGroup:
        """Rename a group and/or replace its hashtags (at least one is required)."""
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if hashtags is not None:
            body["hashtags"] = hashtags
        return self._client._request("PUT", f"/api/hashtag-groups/{group_id}", json=body)["group"]

    def delete(self, group_id: int) -> Dict[str, Any]:
        """Delete a group. Posts that already contain its hashtags are untouched."""
        return self._client._request("DELETE", f"/api/hashtag-groups/{group_id}")


class AsyncHashtagGroupsResource:
    """Async variant of :class:`HashtagGroupsResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[HashtagGroup]:
        """List groups — see :meth:`HashtagGroupsResource.list`."""
        return (await self._client._request("GET", "/api/hashtag-groups"))["groups"]

    async def get(self, group_id: int) -> HashtagGroup:
        """Get a group — see :meth:`HashtagGroupsResource.get`."""
        return (await self._client._request("GET", f"/api/hashtag-groups/{group_id}"))["group"]

    async def create(self, *, name: str, hashtags: List[str]) -> HashtagGroup:
        """Create a group — see :meth:`HashtagGroupsResource.create`."""
        return (
            await self._client._request(
                "POST", "/api/hashtag-groups", json={"name": name, "hashtags": hashtags}
            )
        )["group"]

    async def update(
        self,
        group_id: int,
        *,
        name: Optional[str] = None,
        hashtags: Optional[List[str]] = None,
    ) -> HashtagGroup:
        """Update a group — see :meth:`HashtagGroupsResource.update`."""
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if hashtags is not None:
            body["hashtags"] = hashtags
        return (await self._client._request("PUT", f"/api/hashtag-groups/{group_id}", json=body))["group"]

    async def delete(self, group_id: int) -> Dict[str, Any]:
        """Delete a group — see :meth:`HashtagGroupsResource.delete`."""
        return await self._client._request("DELETE", f"/api/hashtag-groups/{group_id}")
