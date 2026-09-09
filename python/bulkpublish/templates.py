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

    def list(self, *, kind: Optional[str] = None) -> List[PostTemplate]:
        """Templates in the organization, sorted by name.

        ``kind`` is ``caption`` (default) or ``first_comment``.
        """
        params = {"kind": kind} if kind is not None else None
        return self._client._request("GET", "/api/templates", params=params)["templates"]

    def get(self, template_id: int) -> PostTemplate:
        return self._client._request("GET", f"/api/templates/{template_id}")["template"]

    def create(self, *, name: str, content: str, kind: Optional[str] = None) -> PostTemplate:
        """Create a template. Up to 200 per organization per kind; names are unique per kind (default kind: ``caption``)."""
        body: Dict[str, Any] = {"name": name, "content": content}
        if kind is not None:
            body["kind"] = kind
        return self._client._request("POST", "/api/templates", json=body)["template"]

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

    async def list(self, *, kind: Optional[str] = None) -> List[PostTemplate]:
        params = {"kind": kind} if kind is not None else None
        return (await self._client._request("GET", "/api/templates", params=params))["templates"]

    async def get(self, template_id: int) -> PostTemplate:
        return (await self._client._request("GET", f"/api/templates/{template_id}"))["template"]

    async def create(self, *, name: str, content: str, kind: Optional[str] = None) -> PostTemplate:
        body: Dict[str, Any] = {"name": name, "content": content}
        if kind is not None:
            body["kind"] = kind
        return (await self._client._request("POST", "/api/templates", json=body))["template"]

    async def update(self, template_id: int, *, name: Optional[str] = None, content: Optional[str] = None) -> PostTemplate:
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if content is not None:
            body["content"] = content
        return (await self._client._request("PUT", f"/api/templates/{template_id}", json=body))["template"]

    async def delete(self, template_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/templates/{template_id}")
