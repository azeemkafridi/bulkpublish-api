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

from .types import (
    Label,
    MediaFile,
    MediaList,
    MediaUploadResponse,
    MultipartPart,
    MultipartUpload,
)


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
        type: Optional[str] = None,
    ) -> MediaList:
        """List uploaded media files with optional filtering.

        Args:
            search: Search by filename.
            page: Page number (1-based).
            limit: Results per page.
            label_ids: Filter by label IDs.
            type: Filter by media kind — ``"image"`` or ``"video"``
                (matches the MIME type prefix).

        Returns:
            Paginated media list with ``files``, ``page``, ``limit``, and
            ``total`` — the count of matching files across ALL pages.

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
        if type is not None:
            params["type"] = type
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
            file: Path to a local file, an ``https://`` URL, or an open
                file-like object with a ``read()`` method. URLs are
                downloaded automatically before uploading.
            filename: Override the filename sent to the server.  Defaults to
                the basename of the file path or URL.
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

            # Upload from a URL
            result = bp.media.upload("https://example.com/photo.jpg")

            # Upload from a file object
            with open("video.mp4", "rb") as f:
                result = bp.media.upload(f, content_type="video/mp4")
        """
        if isinstance(file, str):
            # URL — download first, then upload
            if file.startswith("http://") or file.startswith("https://"):
                import httpx as _httpx
                resp = _httpx.get(file, follow_redirects=True, timeout=60)
                resp.raise_for_status()
                fname = filename or file.split("/")[-1].split("?")[0] or "upload"
                mime = content_type or resp.headers.get("content-type", "").split(";")[0] or mimetypes.guess_type(fname)[0] or "application/octet-stream"
                files = {"file": (fname, resp.content, mime)}
                return self._client._request("POST", "/api/media", files=files)

            # Local file path
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

    def create_multipart(
        self, *, content_type: str, size_bytes: int
    ) -> MultipartUpload:
        """Start a chunked (multipart) direct-to-storage upload for large
        files — videos up to 1GB, images up to 100MB.

        Step 1 of a three-step flow. Returns an ``uploadId``, the fixed
        ``partSize`` (10485760 bytes = 10MB), and one presigned PUT URL per
        part in ``partUrls``. PUT each 10MB slice of the file to its URL and
        collect the ``ETag`` response header of every part — a failed part can
        be retried on its own, so a network drop never restarts the whole
        file. Then call :meth:`complete_multipart` with the collected parts
        (or :meth:`abort_multipart` to cancel). Part URLs expire after
        ``expiresIn`` seconds (3600).

        Args:
            content_type: One of the allowed media MIME types.
            size_bytes: Exact file size in bytes.

        Raises:
            ValidationError: Disallowed type or file too large.
            RateLimitError: Storage quota exceeded.

        Example::

            up = bp.media.create_multipart(
                content_type="video/mp4", size_bytes=size,
            )
            parts = []
            with open("promo.mp4", "rb") as f:
                for i, url in enumerate(up["partUrls"]):
                    chunk = f.read(up["partSize"])
                    resp = httpx.put(url, content=chunk)
                    parts.append({"partNumber": i + 1, "etag": resp.headers["etag"]})
            result = bp.media.complete_multipart(
                r2_key=up["r2Key"], upload_id=up["uploadId"], parts=parts,
                file_name="promo.mp4", mime_type="video/mp4", size_bytes=size,
            )
        """
        return self._client._request(
            "POST",
            "/api/media/multipart/create",
            json={"contentType": content_type, "sizeBytes": size_bytes},
        )

    def complete_multipart(
        self,
        *,
        r2_key: str,
        upload_id: str,
        parts: List[MultipartPart],
        file_name: str,
        mime_type: str,
        size_bytes: int,
        width: Optional[int] = None,
        height: Optional[int] = None,
        duration: Optional[int] = None,
    ) -> MediaUploadResponse:
        """Complete a multipart upload.

        The server assembles the uploaded parts, verifies the stored object
        (existence, size, content magic bytes, storage quota) and records the
        media file — same verification and response shape as the single-PUT
        finalize endpoint. A failed assembly automatically aborts the upload.

        Args:
            r2_key: The ``r2Key`` from :meth:`create_multipart`.
            upload_id: The ``uploadId`` from :meth:`create_multipart`.
            parts: Every uploaded part as ``{"partNumber": n, "etag": "..."}``
                (at least 1).
            file_name: Original file name.
            mime_type: File MIME type.
            size_bytes: File size in bytes.
            width: Pixel width (images/video).
            height: Pixel height (images/video).
            duration: Duration in seconds (video).

        Returns:
            The recorded media file, wrapped as ``{"file": ...}``.
        """
        body: Dict[str, Any] = {
            "r2Key": r2_key,
            "uploadId": upload_id,
            "parts": parts,
            "fileName": file_name,
            "mimeType": mime_type,
            "sizeBytes": size_bytes,
        }
        if width is not None:
            body["width"] = width
        if height is not None:
            body["height"] = height
        if duration is not None:
            body["duration"] = duration
        return self._client._request("POST", "/api/media/multipart/complete", json=body)

    def abort_multipart(self, *, r2_key: str, upload_id: str) -> Dict[str, Any]:
        """Abort an in-progress multipart upload and free its stored parts.

        Args:
            r2_key: The ``r2Key`` from :meth:`create_multipart`.
            upload_id: The ``uploadId`` from :meth:`create_multipart`.
        """
        return self._client._request(
            "POST",
            "/api/media/multipart/abort",
            json={"r2Key": r2_key, "uploadId": upload_id},
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
        type: Optional[str] = None,
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
        if type is not None:
            params["type"] = type
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
            # URL — download first, then upload
            if file.startswith("http://") or file.startswith("https://"):
                import httpx as _httpx
                async with _httpx.AsyncClient() as dl:
                    resp = await dl.get(file, follow_redirects=True, timeout=60)
                    resp.raise_for_status()
                fname = filename or file.split("/")[-1].split("?")[0] or "upload"
                mime = content_type or resp.headers.get("content-type", "").split(";")[0] or mimetypes.guess_type(fname)[0] or "application/octet-stream"
                files = {"file": (fname, resp.content, mime)}
                return await self._client._request("POST", "/api/media", files=files)

            # Local file path
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

    async def create_multipart(
        self, *, content_type: str, size_bytes: int
    ) -> MultipartUpload:
        """Start a multipart upload — see :meth:`MediaResource.create_multipart`."""
        return await self._client._request(
            "POST",
            "/api/media/multipart/create",
            json={"contentType": content_type, "sizeBytes": size_bytes},
        )

    async def complete_multipart(
        self,
        *,
        r2_key: str,
        upload_id: str,
        parts: List[MultipartPart],
        file_name: str,
        mime_type: str,
        size_bytes: int,
        width: Optional[int] = None,
        height: Optional[int] = None,
        duration: Optional[int] = None,
    ) -> MediaUploadResponse:
        """Complete a multipart upload — see :meth:`MediaResource.complete_multipart`."""
        body: Dict[str, Any] = {
            "r2Key": r2_key,
            "uploadId": upload_id,
            "parts": parts,
            "fileName": file_name,
            "mimeType": mime_type,
            "sizeBytes": size_bytes,
        }
        if width is not None:
            body["width"] = width
        if height is not None:
            body["height"] = height
        if duration is not None:
            body["duration"] = duration
        return await self._client._request(
            "POST", "/api/media/multipart/complete", json=body
        )

    async def abort_multipart(self, *, r2_key: str, upload_id: str) -> Dict[str, Any]:
        """Abort a multipart upload — see :meth:`MediaResource.abort_multipart`."""
        return await self._client._request(
            "POST",
            "/api/media/multipart/abort",
            json={"r2Key": r2_key, "uploadId": upload_id},
        )
