"""Client connect links: one-time links for a client to connect their own platform account."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import ClientConnectLink

# The list is paged server-side (50 per page by default, at most 100).
_PAGE_MAX = 100


def _page_params(page: Optional[int], limit: Optional[int]) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if page is not None:
        params["page"] = page
    if limit is not None:
        params["limit"] = limit
    return params


# For "bluesky", the client enters their handle and approves access on Bluesky
# (never a password). For "facebook", they sign in to Facebook and then pick
# which one of their Pages to connect. For "mastodon", they first enter the
# address of the server their account is on.
CLIENT_CONNECT_PLATFORMS = (
    "bluesky", "facebook", "instagram", "x", "tiktok", "youtube", "threads", "pinterest",
    "gmb", "linkedin", "mastodon", "discord", "tumblr", "snapchat",
)


class ClientConnectLinksResource:
    """Operations on client-connect links (``client.client_connect_links``).

    Pro and Business only: the single-seat plans (Free, Lifetime) have no
    client collaboration, and every method here raises the 403
    ``FEATURE_DISABLED`` error (with ``plan`` and ``upgrade: true``) for them.

    One-time links a client opens, with no BulkPublish account of their own,
    to connect one of their platform accounts into your organization. The
    raw connect URL is returned once, on create, and cannot be recovered
    afterward — the server stores only its hash.
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self, *, page: Optional[int] = None, limit: Optional[int] = None) -> List[ClientConnectLink]:
        """Client-connect links in the organization, newest first.

        With neither ``page`` nor ``limit``, every link is returned (the pages
        are walked for you, 100 at a time). With either, only that page is
        returned: 50 per page by default, ``limit`` up to 100.
        """
        if page is not None or limit is not None:
            return self._client._request("GET", "/api/client-connect-links", params=_page_params(page, limit))["clientConnectLinks"]
        out: List[ClientConnectLink] = []
        current = 1
        while True:
            body = self._client._request("GET", "/api/client-connect-links", params={"page": current, "limit": _PAGE_MAX})
            rows = body["clientConnectLinks"]
            out.extend(rows)
            if not rows or current * _PAGE_MAX >= int(body.get("total", 0)):
                return out
            current += 1

    def create(self, *, name: str) -> Dict[str, Any]:
        """Create a link. Expires in 7 days or on first use, whichever comes first.

        Returns:
            ``{"clientConnectLink", "url"}``.
        """
        return self._client._request("POST", "/api/client-connect-links", json={"name": name})

    def delete(self, client_connect_link_id: int) -> Dict[str, Any]:
        """Revoke a link. Idempotent; a channel it already connected is untouched."""
        return self._client._request("DELETE", f"/api/client-connect-links/{client_connect_link_id}")


class AsyncClientConnectLinksResource:
    """Async variant of :class:`ClientConnectLinksResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self, *, page: Optional[int] = None, limit: Optional[int] = None) -> List[ClientConnectLink]:
        if page is not None or limit is not None:
            return (await self._client._request("GET", "/api/client-connect-links", params=_page_params(page, limit)))["clientConnectLinks"]
        out: List[ClientConnectLink] = []
        current = 1
        while True:
            body = await self._client._request("GET", "/api/client-connect-links", params={"page": current, "limit": _PAGE_MAX})
            rows = body["clientConnectLinks"]
            out.extend(rows)
            if not rows or current * _PAGE_MAX >= int(body.get("total", 0)):
                return out
            current += 1

    async def create(self, *, name: str) -> Dict[str, Any]:
        return await self._client._request("POST", "/api/client-connect-links", json={"name": name})

    async def delete(self, client_connect_link_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/client-connect-links/{client_connect_link_id}")
