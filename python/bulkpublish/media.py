"""
Media resource for the BulkPublish SDK.

Provides methods to upload, list, retrieve, delete, and label media files
used as attachments in social-media posts.
"""

from __future__ import annotations

import mimetypes
import os
from typing import TYPE_CHECKING, Any, BinaryIO, Dict, List, Optional, Union

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Label, MediaFile, MediaList, MediaUploadResponse


class MediaResource:
    """Operations on media files (images, videos, etc.).

    Access via ``client.media``:

    Example::

        bp = BulkPublish("bp_key")
        result = bp.media.upload("./photo.jpg")
        print(result["file"]["url"])
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(
        self,
        *,
        search: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        label_ids: Optional[List[str]] = None,
    ) -> MediaList:
        """List uploaded media files with optional filtering.

        Args:
            search: Search by filename.
            page: Page number (1-based).
            limit: Results per page.
            label_ids: Filter by label IDs.

        Returns:
            Paginated media list with ``files``, ``total``, ``page``,
            ``limit``, and ``totalPages``.

        Example::

            media = bp.media.list(limit=20)
            for f in media["files"]:
                print(f["filename"], f["mimeType"], f["size"])
        """
        params: Dict[str, Any] = {}
        if search is not None:
            params["search"] = search
        if page is not None:
            params["page"] = page
        if limit is not None:
            params["limit"] = limit
        if label_ids is not None:
            params["labelIds"] = ",".join(label_ids)
        return self._client._request("GET", "/api/media", params=params)

    def upload(
        self,
        file: Union[str, BinaryIO],
        *,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> MediaUploadResponse:
        """Upload a media file.

        Args:
            file: Path to a local file (``str``) or an open file-like object
                with a ``read()`` method.
            filename: Override the filename sent to the server.  Defaults to
                the basename of the file path.
            content_type: MIME type override (e.g. ``"image/png"``).  If not
                provided, the server infers it from the filename.

        Returns:
            Dict with a ``file`` key containing the uploaded
            :class:`~bulkpublish.types.MediaFile`.

        Raises:
            FileNotFoundError: If ``file`` is a path that does not exist.

        Example::

            # Upload from a file path
            result = bp.media.upload("./banner.png")
            file_id = result["file"]["id"]

            # Upload from a file object
            with open("video.mp4", "rb") as f:
                result = bp.media.upload(f, content_type="video/mp4")
        """
        if isinstance(file, str):
            path = file
            if not os.path.isfile(path):
                raise FileNotFoundError(f"File not found: {path}")
            fname = filename or os.path.basename(path)
            mime = content_type or mimetypes.guess_type(fname)[0] or "application/octet-stream"
            with open(path, "rb") as fobj:
                files = {"file": (fname, fobj, mime)}
                return self._client._request("POST", "/api/media", files=files)
        else:
            fname = filename or getattr(file, "name", "upload")
            if isinstance(fname, str) and os.sep in fname:
                fname = os.path.basename(fname)
            mime = content_type or mimetypes.guess_type(fname)[0] or "application/octet-stream"
            files = {"file": (fname, file, mime)}
            return self._client._request("POST", "/api/media", files=files)

    def get(self, media_id: str) -> MediaFile:
        """Get a single media file by ID.

        Args:
            media_id: The media file's unique identifier.

        Returns:
            The full media file object.

        Raises:
            NotFoundError: If the file does not exist.

        Example::

            media = bp.media.get("med_abc123")
            print(media["url"], media["mimeType"])
        """
        return self._client._request("GET", f"/api/media/{media_id}")

    def delete(self, media_id: str) -> Dict[str, Any]:
        """Delete a media file.

        Removes the file from storage.  Posts that reference this file will
        lose their attachment.

        Args:
            media_id: The media file's unique identifier.

        Returns:
            Confirmation dict.

        Example::

            bp.media.delete("med_abc123")
        """
        return self._client._request("DELETE", f"/api/media/{media_id}")

    def thumbnail(self, media_id: str) -> bytes:
        """Get the thumbnail image for a media file.

        Args:
            media_id: The media file's unique identifier.

        Returns:
            Raw thumbnail bytes (typically JPEG or PNG).

        Example::

            thumb_bytes = bp.media.thumbnail("med_abc123")
            with open("thumb.jpg", "wb") as f:
                f.write(thumb_bytes)
        """
        return self._client._request(
            "GET", f"/api/media/{media_id}/thumbnail", raw_response=True
        )

    def get_labels(self, media_id: str) -> List[Label]:
        """Get labels assigned to a media file.

        Args:
            media_id: The media file's unique identifier.

        Returns:
            List of label objects.

        Example::

            labels = bp.media.get_labels("med_abc123")
            for label in labels:
                print(label["name"], label["color"])
        """
        return self._client._request("GET", f"/api/media/{media_id}/labels")

    def set_labels(self, media_id: str, *, label_ids: List[str]) -> Dict[str, Any]:
        """Set (replace) the labels on a media file.

        Args:
            media_id: The media file's unique identifier.
            label_ids: List of label IDs to assign.

        Returns:
            Confirmation dict.

        Example::

            bp.media.set_labels("med_abc123", label_ids=["lbl_1", "lbl_2"])
        """
        return self._client._request(
            "PUT", f"/api/media/{media_id}/labels", json={"labelIds": label_ids}
        )


class AsyncMediaResource:
    """Async version of :class:`MediaResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            result = await bp.media.upload("./photo.jpg")
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(
        self,
        *,
        search: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        label_ids: Optional[List[str]] = None,
    ) -> MediaList:
        """List media — see :meth:`MediaResource.list` for full docs."""
        params: Dict[str, Any] = {}
        if search is not None:
            params["search"] = search
        if page is not None:
            params["page"] = page
        if limit is not None:
            params["limit"] = limit
        if label_ids is not None:
            params["labelIds"] = ",".join(label_ids)
        return await self._client._request("GET", "/api/media", params=params)

    async def upload(
        self,
        file: Union[str, BinaryIO],
        *,
        filename: Optional[str] = None,
        content_type: Optional[str] = None,
    ) -> MediaUploadResponse:
        """Upload media — see :meth:`MediaResource.upload` for full docs."""
        if isinstance(file, str):
            path = file
            if not os.path.isfile(path):
                raise FileNotFoundError(f"File not found: {path}")
            fname = filename or os.path.basename(path)
            mime = content_type or mimetypes.guess_type(fname)[0] or "application/octet-stream"
            with open(path, "rb") as fobj:
                files = {"file": (fname, fobj, mime)}
                return await self._client._request("POST", "/api/media", files=files)
        else:
            fname = filename or getattr(file, "name", "upload")
            if isinstance(fname, str) and os.sep in fname:
                fname = os.path.basename(fname)
            mime = content_type or mimetypes.guess_type(fname)[0] or "application/octet-stream"
            files = {"file": (fname, file, mime)}
            return await self._client._request("POST", "/api/media", files=files)

    async def get(self, media_id: str) -> MediaFile:
        """Get a media file — see :meth:`MediaResource.get` for full docs."""
        return await self._client._request("GET", f"/api/media/{media_id}")

    async def delete(self, media_id: str) -> Dict[str, Any]:
        """Delete media — see :meth:`MediaResource.delete` for full docs."""
        return await self._client._request("DELETE", f"/api/media/{media_id}")

    async def thumbnail(self, media_id: str) -> bytes:
        """Get thumbnail — see :meth:`MediaResource.thumbnail` for full docs."""
        return await self._client._request(
            "GET", f"/api/media/{media_id}/thumbnail", raw_response=True
        )

    async def get_labels(self, media_id: str) -> List[Label]:
        """Get media labels — see :meth:`MediaResource.get_labels`."""
        return await self._client._request("GET", f"/api/media/{media_id}/labels")

    async def set_labels(self, media_id: str, *, label_ids: List[str]) -> Dict[str, Any]:
        """Set media labels — see :meth:`MediaResource.set_labels`."""
        return await self._client._request(
            "PUT", f"/api/media/{media_id}/labels", json={"labelIds": label_ids}
        )
