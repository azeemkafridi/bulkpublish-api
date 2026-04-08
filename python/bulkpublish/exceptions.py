"""
Exception classes for the BulkPublish SDK.

All exceptions inherit from :class:`BulkPublishError`, so you can catch
that single base class to handle every SDK-specific failure.
"""

from __future__ import annotations

from typing import Any, Dict, Optional


class BulkPublishError(Exception):
    """Base exception for all BulkPublish SDK errors.

    Attributes:
        message: Human-readable error description.
        status_code: HTTP status code, if the error originated from an API response.
        response_body: Raw response body dict, when available.

    Example::

        from bulkpublish import BulkPublish
        from bulkpublish.exceptions import BulkPublishError

        bp = BulkPublish("bp_test_key")
        try:
            bp.posts.get("nonexistent")
        except BulkPublishError as exc:
            print(exc.status_code, exc.message)
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = None,
        response_body: Optional[Dict[str, Any]] = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.response_body = response_body or {}
        super().__init__(message)

    def __repr__(self) -> str:
        return (
            f"{self.__class__.__name__}(message={self.message!r}, "
            f"status_code={self.status_code!r})"
        )


class AuthenticationError(BulkPublishError):
    """Raised when the API key is missing, invalid, or expired (HTTP 401).

    Example::

        from bulkpublish.exceptions import AuthenticationError

        try:
            bp.posts.list()
        except AuthenticationError:
            print("Check your API key")
    """


class PermissionError(BulkPublishError):
    """Raised when the authenticated key lacks permission for the action (HTTP 403).

    Example::

        from bulkpublish.exceptions import PermissionError

        try:
            bp.posts.delete("some-id")
        except PermissionError:
            print("Your API key does not have permission for this action")
    """


class NotFoundError(BulkPublishError):
    """Raised when the requested resource does not exist (HTTP 404).

    Example::

        from bulkpublish.exceptions import NotFoundError

        try:
            post = bp.posts.get("nonexistent-id")
        except NotFoundError:
            print("Post not found")
    """


class ValidationError(BulkPublishError):
    """Raised when the request body fails server-side validation (HTTP 400/422).

    The ``response_body`` attribute often contains field-level error details.

    Example::

        from bulkpublish.exceptions import ValidationError

        try:
            bp.posts.create(content="", channels=[])
        except ValidationError as exc:
            print(exc.response_body)  # field-level errors
    """


class RateLimitError(BulkPublishError):
    """Raised when the API rate limit has been exceeded (HTTP 429).

    Attributes:
        retry_after: Seconds to wait before retrying, if the server provided
            the ``Retry-After`` header.

    Example::

        import time
        from bulkpublish.exceptions import RateLimitError

        try:
            bp.posts.list()
        except RateLimitError as exc:
            if exc.retry_after:
                time.sleep(exc.retry_after)
    """

    def __init__(
        self,
        message: str,
        status_code: Optional[int] = 429,
        response_body: Optional[Dict[str, Any]] = None,
        retry_after: Optional[float] = None,
    ) -> None:
        super().__init__(message, status_code, response_body)
        self.retry_after = retry_after


class ConflictError(BulkPublishError):
    """Raised on resource conflicts (HTTP 409).

    Example::

        from bulkpublish.exceptions import ConflictError

        try:
            bp.labels.create(name="existing-label", color="#ff0000")
        except ConflictError:
            print("A label with that name already exists")
    """


class ServerError(BulkPublishError):
    """Raised when the BulkPublish server returns a 5xx error.

    Example::

        from bulkpublish.exceptions import ServerError

        try:
            bp.analytics.refresh()
        except ServerError:
            print("BulkPublish is experiencing issues, try again later")
    """


class TimeoutError(BulkPublishError):
    """Raised when a request exceeds the configured timeout.

    Example::

        from bulkpublish.exceptions import TimeoutError

        try:
            bp.media.upload("large_video.mp4")
        except TimeoutError:
            print("Upload timed out — try increasing client timeout")
    """
