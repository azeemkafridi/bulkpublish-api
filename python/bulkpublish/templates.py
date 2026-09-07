"""Post templates: saved text to start a new post from. Organization-wide, text only."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import PostTemplate


class TemplatesResource:
    """Operations on saved post templates (``client.templates``)."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[PostTemplate]:
        """Every template in the organization, sorted by name."""
        return self._client._request("GET", "/api/templates")["templates"]

    def get(self, template_id: int) -> PostTemplate:
        return self._client._request("GET", f"/api/templates/{template_id}")["template"]

    def create(self, *, name: str, content: str) -> PostTemplate:
        """Create a template. Up to 200 per organization; names are unique."""
        return self._client._request("POST", "/api/templates", json={"name": name, "content": content})["template"]

    def update(self, template_id: int, *, name: Optional[str] = None, content: Optional[str] = None) -> PostTemplate:
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if content is not None:
            body["content"] = content
        return self._client._request("PUT", f"/api/templates/{template_id}", json=body)["template"]

    def delete(self, template_id: int) -> Dict[str, Any]:
        return self._client._request("DELETE", f"/api/templates/{template_id}")


class AsyncTemplatesResource:
    """Async variant of :class:`TemplatesResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[PostTemplate]:
        return (await self._client._request("GET", "/api/templates"))["templates"]

    async def get(self, template_id: int) -> PostTemplate:
        return (await self._client._request("GET", f"/api/templates/{template_id}"))["template"]

    async def create(self, *, name: str, content: str) -> PostTemplate:
        return (await self._client._request("POST", "/api/templates", json={"name": name, "content": content}))["template"]

    async def update(self, template_id: int, *, name: Optional[str] = None, content: Optional[str] = None) -> PostTemplate:
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if content is not None:
            body["content"] = content
        return (await self._client._request("PUT", f"/api/templates/{template_id}", json=body))["template"]

    async def delete(self, template_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/templates/{template_id}")
