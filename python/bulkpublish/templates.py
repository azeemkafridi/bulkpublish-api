"""Post templates: saved text, and optionally a post setup, to start a new post from."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import PostTemplate


class _Unset:
    """Marks a keyword argument that was not passed (distinct from ``None``)."""

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return "UNSET"


UNSET: Any = _Unset()

# Python keyword -> request field for the post setup a caption template keeps.
_SETUP_FIELDS = {
    "channel_ids": "channelIds",
    "post_format": "postFormat",
    "post_type_overrides": "postTypeOverrides",
    "media_file_ids": "mediaFileIds",
    "platform_media_file_ids": "platformMediaFileIds",
    "platform_content": "platformContent",
}


def _setup_body(values: Dict[str, Any], *, allow_null: bool) -> Dict[str, Any]:
    """Request fields for the setup values that were passed.

    On create, ``None`` means "not set". On update, ``None`` is sent as JSON
    ``null``, which clears that part of the template; leave the argument out to
    keep the stored value.
    """
    body: Dict[str, Any] = {}
    for key, field in _SETUP_FIELDS.items():
        value = values[key]
        if value is UNSET or (value is None and not allow_null):
            continue
        body[field] = value
    return body


_SETUP_DOC = """
        A caption template can also keep a post setup (caption templates only;
        sending any of these with ``kind="first_comment"`` is a 400):

        - ``channel_ids``: channels a post started from it goes to. Channels
          disconnected since are skipped. Must belong to the workspace (403).
        - ``post_format``: ``post``, ``video``, ``reel``, ``story``,
          ``carousel`` or ``thread``.
        - ``post_type_overrides``: per-platform post types, as on a post.
        - ``media_file_ids``: media file IDs a post started from it attaches.
          A file a template uses is kept in the media library. Must belong to
          the workspace (403).
        - ``platform_media_file_ids``: which of ``media_file_ids`` each
          platform gets, as a post's ``platform_media_file_ids``; every id
          must be in ``media_file_ids``.
        - ``platform_content``: per-platform text, as on a post.

        Per-platform publish options (``platform_specific``) belong to the post.
"""


class TemplatesResource:
    """Operations on saved post templates (``client.templates``)."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self, *, kind: Optional[str] = None) -> List[PostTemplate]:
        """Templates in the organization, sorted by name.

        ``kind`` is ``caption`` (default) or ``first_comment``. Each template
        carries ``media``, its files that are still in the media library.
        """
        params = {"kind": kind} if kind is not None else None
        return self._client._request("GET", "/api/templates", params=params)["templates"]

    def get(self, template_id: int) -> PostTemplate:
        return self._client._request("GET", f"/api/templates/{template_id}")["template"]

    def create(
        self,
        *,
        name: str,
        content: Optional[str] = None,
        kind: Optional[str] = None,
        channel_ids: Optional[List[int]] = None,
        post_format: Optional[str] = None,
        post_type_overrides: Optional[Dict[str, str]] = None,
        media_file_ids: Optional[List[int]] = None,
        platform_media_file_ids: Optional[Dict[str, List[int]]] = None,
        platform_content: Optional[Dict[str, str]] = None,
    ) -> PostTemplate:
        body = _create_body(locals())
        return self._client._request("POST", "/api/templates", json=body)["template"]

    def update(
        self,
        template_id: int,
        *,
        name: Optional[str] = None,
        content: Optional[str] = None,
        channel_ids: Any = UNSET,
        post_format: Any = UNSET,
        post_type_overrides: Any = UNSET,
        media_file_ids: Any = UNSET,
        platform_media_file_ids: Any = UNSET,
        platform_content: Any = UNSET,
    ) -> PostTemplate:
        body = _update_body(locals())
        return self._client._request("PUT", f"/api/templates/{template_id}", json=body)["template"]

    def delete(self, template_id: int) -> Dict[str, Any]:
        return self._client._request("DELETE", f"/api/templates/{template_id}")


TemplatesResource.create.__doc__ = (
    """Create a template. Up to 200 per organization per kind; names are unique
        per kind (default kind: ``caption``). ``content`` is required unless a
        caption template sets one of the setup fields below.
"""
    + _SETUP_DOC
)
TemplatesResource.update.__doc__ = (
    """Rename, replace the text and/or change the setup (at least one field).

        Setup fields left out keep their stored value; passing ``None`` clears
        that part of the template.
"""
    + _SETUP_DOC
)


def _create_body(values: Dict[str, Any]) -> Dict[str, Any]:
    body: Dict[str, Any] = {"name": values["name"]}
    if values["content"] is not None:
        body["content"] = values["content"]
    if values["kind"] is not None:
        body["kind"] = values["kind"]
    body.update(_setup_body(values, allow_null=False))
    return body


def _update_body(values: Dict[str, Any]) -> Dict[str, Any]:
    body: Dict[str, Any] = {}
    if values["name"] is not None:
        body["name"] = values["name"]
    if values["content"] is not None:
        body["content"] = values["content"]
    body.update(_setup_body(values, allow_null=True))
    return body


class AsyncTemplatesResource:
    """Async variant of :class:`TemplatesResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self, *, kind: Optional[str] = None) -> List[PostTemplate]:
        params = {"kind": kind} if kind is not None else None
        return (await self._client._request("GET", "/api/templates", params=params))["templates"]

    async def get(self, template_id: int) -> PostTemplate:
        return (await self._client._request("GET", f"/api/templates/{template_id}"))["template"]

    async def create(
        self,
        *,
        name: str,
        content: Optional[str] = None,
        kind: Optional[str] = None,
        channel_ids: Optional[List[int]] = None,
        post_format: Optional[str] = None,
        post_type_overrides: Optional[Dict[str, str]] = None,
        media_file_ids: Optional[List[int]] = None,
        platform_media_file_ids: Optional[Dict[str, List[int]]] = None,
        platform_content: Optional[Dict[str, str]] = None,
    ) -> PostTemplate:
        """Create a template — see :meth:`TemplatesResource.create`."""
        body = _create_body(locals())
        return (await self._client._request("POST", "/api/templates", json=body))["template"]

    async def update(
        self,
        template_id: int,
        *,
        name: Optional[str] = None,
        content: Optional[str] = None,
        channel_ids: Any = UNSET,
        post_format: Any = UNSET,
        post_type_overrides: Any = UNSET,
        media_file_ids: Any = UNSET,
        platform_media_file_ids: Any = UNSET,
        platform_content: Any = UNSET,
    ) -> PostTemplate:
        """Update a template — see :meth:`TemplatesResource.update`."""
        body = _update_body(locals())
        return (await self._client._request("PUT", f"/api/templates/{template_id}", json=body))["template"]

    async def delete(self, template_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/templates/{template_id}")
