"""Client connect links: one-time links for a client to connect their own platform account."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import ClientConnectLink

CLIENT_CONNECT_PLATFORMS = (
    "instagram", "x", "tiktok", "youtube", "threads", "pinterest",
    "gmb", "linkedin", "reddit", "discord", "tumblr", "snapchat",
)


class ClientConnectLinksResource:
    """Operations on client-connect links (``client.client_connect_links``).

    One-time links a client opens, with no BulkPublish account of their own,
    to connect one of their platform accounts into your organization. The
    raw connect URL is returned once, on create, and cannot be recovered
    afterward — the server stores only its hash.
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[ClientConnectLink]:
        """Every client-connect link in the organization, newest first."""
        return self._client._request("GET", "/api/client-connect-links")["clientConnectLinks"]

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

    async def list(self) -> List[ClientConnectLink]:
        return (await self._client._request("GET", "/api/client-connect-links"))["clientConnectLinks"]

    async def create(self, *, name: str) -> Dict[str, Any]:
        return await self._client._request("POST", "/api/client-connect-links", json={"name": name})

    async def delete(self, client_connect_link_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/client-connect-links/{client_connect_link_id}")
