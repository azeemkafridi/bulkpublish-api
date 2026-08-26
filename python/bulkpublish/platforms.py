"""
Platforms resource for the BulkPublish SDK.

Every social platform BulkPublish supports can be switched on or off
server-side. Read this before rendering connect buttons or assuming a post will
go out, so the UI can show "temporarily unavailable" instead of failing later.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import PlatformAvailability


class PlatformsResource:
    """Inspect platform availability.

    Access via ``client.platforms``:

    Example::

        bp = BulkPublish("bp_key")
        for p in bp.platforms.list()["platforms"]:
            if not p["canPublish"]:
                print(p["displayName"], "unavailable:", p.get("message"))
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> Dict[str, List[PlatformAvailability]]:
        """List every supported platform with its current availability.

        Disabled platforms are always **included** with ``enabled: False`` and a
        ``reason`` — never omitted — so you can tell "switched off right now"
        apart from "not supported".

        A platform in state ``off`` rejects post creation with a 403
        ``PLATFORM_DISABLED``, and posts already scheduled against it are
        **held**, not failed, until it is re-enabled. A platform in state
        ``connect_off`` accepts no new channel connections, but channels already
        connected keep publishing.

        A platform may also expose ``variants`` — sub-platforms gated separately
        because the vendor reviews them as a separate app. LinkedIn reports
        ``variants["organization"]`` for company pages, while the platform-level
        state describes personal profiles; check the variant before offering a
        company-page connect.

        Example::

            tumblr = next(
                p for p in bp.platforms.list()["platforms"] if p["platform"] == "tumblr"
            )
            if tumblr["canConnect"]:
                show_connect_button()
        """
        return self._client._request("GET", "/api/platforms")


class AsyncPlatformsResource:
    """Async version of :class:`PlatformsResource`.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            platforms = await bp.platforms.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> Dict[str, List[PlatformAvailability]]:
        """List platform availability — see :meth:`PlatformsResource.list`."""
        return await self._client._request("GET", "/api/platforms")
