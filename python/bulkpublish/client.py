"""
BulkPublish API client — sync and async.

This is the main entry point for the SDK. Import :class:`BulkPublish` for
synchronous usage or :class:`AsyncBulkPublish` for ``async/await``.

Example (sync)::

    from bulkpublish import BulkPublish

    bp = BulkPublish("bp_your_key")
    channels = bp.channels.list()

Example (async)::

    from bulkpublish import AsyncBulkPublish

    async with AsyncBulkPublish("bp_your_key") as bp:
        channels = await bp.channels.list()
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional, Union

import httpx

from .analytics import AnalyticsResource, AsyncAnalyticsResource
from .channels import AsyncChannelsResource, ChannelsResource
from .exceptions import (
    AuthenticationError,
    BulkPublishError,
    ConflictError,
    NotFoundError,
    PermissionError,
    RateLimitError,
    ServerError,
    TimeoutError,
    ValidationError,
)
from .labels import AsyncLabelsResource, LabelsResource
from .media import AsyncMediaResource, MediaResource
from .posts import AsyncPostsResource, PostsResource
from .schedules import AsyncSchedulesResource, SchedulesResource
from .types import (
    ActivityEntry,
    ApiKey,
    ApiKeyUsage,
    ApiKeyUsageHistoryEntry,
    LinkPreview,
    Notification,
    NotificationPreferences,
    Organization,
    QuotaUsage,
)
from .webhooks import AsyncWebhooksResource, WebhooksResource

__all__ = ["BulkPublish", "AsyncBulkPublish"]

_DEFAULT_BASE_URL = "https://app.bulkpublish.com"
_DEFAULT_TIMEOUT = 30.0
_SDK_VERSION = "0.1.0"


def _user_agent() -> str:
    return f"bulkpublish-python/{_SDK_VERSION}"


# ---------------------------------------------------------------------------
# Base class with shared config
# ---------------------------------------------------------------------------


class _BaseClient:
    """Shared configuration for sync and async clients.

    Not intended for direct use — use :class:`BulkPublish` or
    :class:`AsyncBulkPublish` instead.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT,
        max_retries: int = 2,
    ) -> None:
        self.api_key = api_key or os.environ.get("BULKPUBLISH_API_KEY", "")
        if not self.api_key:
            raise AuthenticationError(
                "No API key provided. Pass it as the first argument or set "
                "the BULKPUBLISH_API_KEY environment variable."
            )
        self.base_url = (base_url or os.environ.get("BULKPUBLISH_BASE_URL", _DEFAULT_BASE_URL)).rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries

    @property
    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "User-Agent": _user_agent(),
            "Accept": "application/json",
        }


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


def _raise_for_status(response: httpx.Response) -> None:
    """Inspect an HTTP response and raise the appropriate SDK exception."""
    if response.is_success:
        return

    status = response.status_code
    try:
        body = response.json()
    except Exception:
        body = {"error": response.text}

    message = body.get("error") or body.get("message") or response.reason_phrase or "Unknown error"

    if status == 401:
        raise AuthenticationError(message, status, body)
    if status == 403:
        raise PermissionError(message, status, body)
    if status == 404:
        raise NotFoundError(message, status, body)
    if status in (400, 422):
        raise ValidationError(message, status, body)
    if status == 409:
        raise ConflictError(message, status, body)
    if status == 429:
        retry_after_raw = response.headers.get("Retry-After")
        retry_after = float(retry_after_raw) if retry_after_raw else None
        raise RateLimitError(message, status, body, retry_after=retry_after)
    if status >= 500:
        raise ServerError(message, status, body)

    raise BulkPublishError(message, status, body)


# ---------------------------------------------------------------------------
# Synchronous client
# ---------------------------------------------------------------------------


class BulkPublish(_BaseClient):
    """Synchronous BulkPublish API client.

    Args:
        api_key: Your BulkPublish API key (``bp_...``).  If omitted, the
            ``BULKPUBLISH_API_KEY`` environment variable is used.
        base_url: Override the API base URL.  Defaults to
            ``https://app.bulkpublish.com``.
        timeout: Request timeout in seconds (default 30).
        max_retries: Number of retries on transient failures (default 2).

    Attributes:
        posts: :class:`~bulkpublish.posts.PostsResource`
        channels: :class:`~bulkpublish.channels.ChannelsResource`
        media: :class:`~bulkpublish.media.MediaResource`
        analytics: :class:`~bulkpublish.analytics.AnalyticsResource`
        labels: :class:`~bulkpublish.labels.LabelsResource`
        schedules: :class:`~bulkpublish.schedules.SchedulesResource`
        webhooks: :class:`~bulkpublish.webhooks.WebhooksResource`

    Example::

        from bulkpublish import BulkPublish

        bp = BulkPublish("bp_your_key")

        # List channels
        channels = bp.channels.list()

        # Create a post
        post = bp.posts.create(
            content="Hello from the SDK!",
            channels=[{"channelId": channels[0]["id"], "platform": channels[0]["platform"]}],
        )

        # Upload media and attach it
        media = bp.media.upload("./photo.jpg")
        post = bp.posts.create(
            content="Photo post",
            channels=[{"channelId": channels[0]["id"], "platform": channels[0]["platform"]}],
            media_files=[media["file"]["id"]],
            status="scheduled",
            scheduled_at="2026-04-10T09:00:00Z",
            timezone="America/New_York",
        )
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT,
        max_retries: int = 2,
    ) -> None:
        super().__init__(api_key, base_url=base_url, timeout=timeout, max_retries=max_retries)
        transport = httpx.HTTPTransport(retries=self.max_retries)
        self._http = httpx.Client(
            base_url=self.base_url,
            headers=self._headers,
            timeout=self.timeout,
            transport=transport,
        )

        # Resource namespaces
        self.posts = PostsResource(self)
        self.channels = ChannelsResource(self)
        self.media = MediaResource(self)
        self.analytics = AnalyticsResource(self)
        self.labels = LabelsResource(self)
        self.schedules = SchedulesResource(self)
        self.webhooks = WebhooksResource(self)

    def close(self) -> None:
        """Close the underlying HTTP connection pool.

        Example::

            bp = BulkPublish("bp_key")
            try:
                bp.posts.list()
            finally:
                bp.close()
        """
        self._http.close()

    def __enter__(self) -> "BulkPublish":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        files: Optional[Dict[str, Any]] = None,
        raw_response: bool = False,
    ) -> Any:
        """Execute an HTTP request (internal).

        Args:
            method: HTTP method.
            path: URL path (relative to base_url).
            params: Query parameters.
            json: JSON body.
            files: Multipart file uploads.
            raw_response: Return raw bytes instead of parsed JSON.

        Returns:
            Parsed JSON (dict/list) or raw bytes if ``raw_response``.
        """
        try:
            if files:
                # Multipart upload — don't send Content-Type (httpx sets boundary)
                response = self._http.request(method, path, params=params, files=files)
            else:
                response = self._http.request(method, path, params=params, json=json)
        except httpx.TimeoutException as exc:
            raise TimeoutError(f"Request timed out: {exc}") from exc
        except httpx.HTTPError as exc:
            raise BulkPublishError(f"HTTP error: {exc}") from exc

        _raise_for_status(response)

        if raw_response:
            return response.content

        # Some DELETE endpoints return 204 No Content
        if response.status_code == 204 or not response.content:
            return {"success": True}

        return response.json()

    # -- Convenience methods for non-resource endpoints ----------------------

    def list_api_keys(self) -> List[ApiKey]:
        """List all API keys on your account.

        Returns:
            List of API key objects (secrets are masked).

        Example::

            keys = bp.list_api_keys()
            for key in keys:
                print(f"{key['name']} ({key['prefix']}...)")
        """
        return self._request("GET", "/api/api-keys")

    def create_api_key(self, **fields: Any) -> ApiKey:
        """Create a new API key.

        Args:
            **fields: Key configuration (e.g. ``name``, ``expiresAt``).

        Returns:
            The new API key object.  The full key value is only returned
            once — store it securely.

        Example::

            key = bp.create_api_key(name="CI/CD Key")
            print(f"Save this key: {key.get('key', key.get('token'))}")
        """
        return self._request("POST", "/api/api-keys", json=fields)

    def delete_api_key(self, key_id: str) -> Dict[str, Any]:
        """Delete an API key.

        Args:
            key_id: The key's unique identifier.

        Returns:
            Confirmation dict.

        Example::

            bp.delete_api_key("key_abc123")
        """
        return self._request("DELETE", f"/api/api-keys/{key_id}")

    def api_key_usage(self) -> ApiKeyUsage:
        """Get current API usage for this key.

        Returns:
            Usage dict with ``used``, ``limit``, ``remaining``, and
            ``resetsAt`` keys.

        Example::

            usage = bp.api_key_usage()
            print(f"{usage['used']}/{usage['limit']} requests used")
        """
        return self._request("GET", "/api/api-keys/usage")

    def api_key_usage_history(self) -> List[ApiKeyUsageHistoryEntry]:
        """Get historical API usage data.

        Returns:
            List of daily usage entries.

        Example::

            history = bp.api_key_usage_history()
            for day in history:
                print(f"{day['date']}: {day['count']} requests")
        """
        return self._request("GET", "/api/api-keys/usage/history")

    def quota_usage(self) -> QuotaUsage:
        """Get current plan quota usage.

        Returns:
            Quota usage dict with ``posts``, ``channels``, ``media``,
            and ``plan`` keys.

        Example::

            quotas = bp.quota_usage()
            print(f"Plan: {quotas['plan']}")
            print(f"Posts: {quotas['posts']['used']}/{quotas['posts']['limit']}")
        """
        return self._request("GET", "/api/quotas/usage")

    def list_notifications(self) -> List[Notification]:
        """List notifications.

        Returns:
            List of notification objects.

        Example::

            notifications = bp.list_notifications()
            unread = [n for n in notifications if not n["read"]]
            print(f"{len(unread)} unread notifications")
        """
        return self._request("GET", "/api/notifications")

    def get_notification_preferences(self) -> NotificationPreferences:
        """Get notification preferences.

        Returns:
            Preferences dict.

        Example::

            prefs = bp.get_notification_preferences()
            print(f"Email notifications: {prefs.get('email')}")
        """
        return self._request("GET", "/api/notifications/preferences")

    def update_notification_preferences(self, **prefs: Any) -> NotificationPreferences:
        """Update notification preferences.

        Args:
            **prefs: Preference fields to update (e.g. ``email=True``,
                ``publishFailure=True``).

        Returns:
            Updated preferences dict.

        Example::

            bp.update_notification_preferences(email=True, publishFailure=True)
        """
        return self._request("PUT", "/api/notifications/preferences", json=prefs)

    def list_organizations(self) -> List[Organization]:
        """List organizations you belong to.

        Returns:
            List of organization objects.

        Example::

            orgs = bp.list_organizations()
            for org in orgs:
                print(f"{org['name']} ({org['role']})")
        """
        return self._request("GET", "/api/organizations")

    def link_preview(self, url: str) -> LinkPreview:
        """Fetch Open Graph preview data for a URL.

        Args:
            url: The URL to preview.

        Returns:
            Preview dict with ``title``, ``description``, ``image``, etc.

        Example::

            preview = bp.link_preview("https://example.com/blog/post")
            print(preview["title"], preview.get("image"))
        """
        return self._request("GET", "/api/link-preview", params={"url": url})

    def activity_log(self) -> List[ActivityEntry]:
        """Get the activity log for your account.

        Returns:
            List of activity entries.

        Example::

            activity = bp.activity_log()
            for entry in activity[:5]:
                print(f"{entry['action']} on {entry['resourceType']} at {entry['createdAt']}")
        """
        return self._request("GET", "/api/activity")


# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------


class AsyncBulkPublish(_BaseClient):
    """Asynchronous BulkPublish API client.

    Identical API surface to :class:`BulkPublish` but all methods are
    ``async`` coroutines.  Use as an async context manager.

    Args:
        api_key: Your BulkPublish API key (``bp_...``).  If omitted, the
            ``BULKPUBLISH_API_KEY`` environment variable is used.
        base_url: Override the API base URL.
        timeout: Request timeout in seconds (default 30).
        max_retries: Number of retries on transient failures (default 2).

    Example::

        import asyncio
        from bulkpublish import AsyncBulkPublish

        async def main():
            async with AsyncBulkPublish("bp_your_key") as bp:
                channels = await bp.channels.list()
                post = await bp.posts.create(
                    content="Async posting!",
                    channels=[{"channelId": channels[0]["id"],
                               "platform": channels[0]["platform"]}],
                )
                print(post["id"])

        asyncio.run(main())
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        base_url: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT,
        max_retries: int = 2,
    ) -> None:
        super().__init__(api_key, base_url=base_url, timeout=timeout, max_retries=max_retries)
        transport = httpx.AsyncHTTPTransport(retries=self.max_retries)
        self._http = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self._headers,
            timeout=self.timeout,
            transport=transport,
        )

        # Resource namespaces
        self.posts = AsyncPostsResource(self)
        self.channels = AsyncChannelsResource(self)
        self.media = AsyncMediaResource(self)
        self.analytics = AsyncAnalyticsResource(self)
        self.labels = AsyncLabelsResource(self)
        self.schedules = AsyncSchedulesResource(self)
        self.webhooks = AsyncWebhooksResource(self)

    async def close(self) -> None:
        """Close the underlying async HTTP connection pool.

        Example::

            bp = AsyncBulkPublish("bp_key")
            try:
                await bp.posts.list()
            finally:
                await bp.close()
        """
        await self._http.aclose()

    async def __aenter__(self) -> "AsyncBulkPublish":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json: Optional[Any] = None,
        files: Optional[Dict[str, Any]] = None,
        raw_response: bool = False,
    ) -> Any:
        """Execute an async HTTP request (internal)."""
        try:
            if files:
                response = await self._http.request(method, path, params=params, files=files)
            else:
                response = await self._http.request(method, path, params=params, json=json)
        except httpx.TimeoutException as exc:
            raise TimeoutError(f"Request timed out: {exc}") from exc
        except httpx.HTTPError as exc:
            raise BulkPublishError(f"HTTP error: {exc}") from exc

        _raise_for_status(response)

        if raw_response:
            return response.content

        if response.status_code == 204 or not response.content:
            return {"success": True}

        return response.json()

    # -- Convenience methods (async versions) --------------------------------

    async def list_api_keys(self) -> List[ApiKey]:
        """List API keys — see :meth:`BulkPublish.list_api_keys`."""
        return await self._request("GET", "/api/api-keys")

    async def create_api_key(self, **fields: Any) -> ApiKey:
        """Create API key — see :meth:`BulkPublish.create_api_key`."""
        return await self._request("POST", "/api/api-keys", json=fields)

    async def delete_api_key(self, key_id: str) -> Dict[str, Any]:
        """Delete API key — see :meth:`BulkPublish.delete_api_key`."""
        return await self._request("DELETE", f"/api/api-keys/{key_id}")

    async def api_key_usage(self) -> ApiKeyUsage:
        """Get API usage — see :meth:`BulkPublish.api_key_usage`."""
        return await self._request("GET", "/api/api-keys/usage")

    async def api_key_usage_history(self) -> List[ApiKeyUsageHistoryEntry]:
        """Get usage history — see :meth:`BulkPublish.api_key_usage_history`."""
        return await self._request("GET", "/api/api-keys/usage/history")

    async def quota_usage(self) -> QuotaUsage:
        """Get quota usage — see :meth:`BulkPublish.quota_usage`."""
        return await self._request("GET", "/api/quotas/usage")

    async def list_notifications(self) -> List[Notification]:
        """List notifications — see :meth:`BulkPublish.list_notifications`."""
        return await self._request("GET", "/api/notifications")

    async def get_notification_preferences(self) -> NotificationPreferences:
        """Get notification prefs — see :meth:`BulkPublish.get_notification_preferences`."""
        return await self._request("GET", "/api/notifications/preferences")

    async def update_notification_preferences(self, **prefs: Any) -> NotificationPreferences:
        """Update notification prefs — see :meth:`BulkPublish.update_notification_preferences`."""
        return await self._request("PUT", "/api/notifications/preferences", json=prefs)

    async def list_organizations(self) -> List[Organization]:
        """List organizations — see :meth:`BulkPublish.list_organizations`."""
        return await self._request("GET", "/api/organizations")

    async def link_preview(self, url: str) -> LinkPreview:
        """Fetch link preview — see :meth:`BulkPublish.link_preview`."""
        return await self._request("GET", "/api/link-preview", params={"url": url})

    async def activity_log(self) -> List[ActivityEntry]:
        """Get activity log — see :meth:`BulkPublish.activity_log`."""
        return await self._request("GET", "/api/activity")
