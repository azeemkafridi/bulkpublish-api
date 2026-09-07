"""
Notifications resource for the BulkPublish SDK.

What the app has told you: a post published, a post failed, a connection is
about to expire. This is a read-and-acknowledge surface, and the closest thing
to being notified that the API offers. It is still something you ask for rather
than something that arrives.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import NotificationList, NotificationPreferences


class NotificationsResource:
    """Operations on notifications.

    Access via ``client.notifications``:

    Example::

        bp = BulkPublish("bp_key")
        page = bp.notifications.list(unread_only=True)
        print(page["unreadTotal"])
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        unread_only: bool = False,
    ) -> NotificationList:
        """List notifications, newest first.

        Args:
            page: 1-based page number. Defaults to 1.
            limit: Page size, 1 to 100. Defaults to 20.
            unread_only: Return only unread notifications.

        Returns:
            A page of notifications plus ``unreadTotal``, which counts unread
            across the whole account rather than this page, and is unaffected
            by ``unread_only`` so it means the same thing however you filtered.

        Example::

            page = bp.notifications.list(limit=50, unread_only=True)
            for n in page["notifications"]:
                print(n["type"], n["title"])
        """
        params: Dict[str, Any] = {}
        if page is not None:
            params["page"] = page
        if limit is not None:
            params["limit"] = limit
        if unread_only:
            params["unreadOnly"] = "true"
        return self._client._request("GET", "/api/notifications", params=params)

    def mark_read(
        self, *, ids: Optional[List[int]] = None, all: bool = False
    ) -> Dict[str, Any]:
        """Mark notifications read.

        Pass exactly one of ``ids`` or ``all``.

        Args:
            ids: Notification ids to mark read.
            all: Mark every notification read.

        Raises:
            ValidationError: If neither or both are given.

        Example::

            bp.notifications.mark_read(all=True)
        """
        return self._client._request(
            "PATCH", "/api/notifications", json=_selection(ids, all)
        )

    def delete(
        self, *, ids: Optional[List[int]] = None, all: bool = False
    ) -> Dict[str, Any]:
        """Delete notifications. Pass exactly one of ``ids`` or ``all``."""
        return self._client._request(
            "DELETE", "/api/notifications", json=_selection(ids, all)
        )

    def preferences(self) -> NotificationPreferences:
        """The current delivery preferences for this user."""
        return self._client._request("GET", "/api/notifications/preferences")

    def update_preferences(self, **prefs: bool) -> NotificationPreferences:
        """Update delivery preferences. Omitted fields are left as they are.

        Keyword Args:
            emailOnFailure, emailOnTokenExpiry, emailOnChannelSlots,
            inAppPublished, inAppFailed, inAppScheduleReminder,
            inAppTokenExpiry, inAppInbox: booleans.

        Example::

            bp.notifications.update_preferences(emailOnFailure=True)
        """
        return self._client._request(
            "PUT", "/api/notifications/preferences", json=prefs
        )


class AsyncNotificationsResource:
    """Async version of :class:`NotificationsResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            page = await bp.notifications.list(unread_only=True)
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(
        self,
        *,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        unread_only: bool = False,
    ) -> NotificationList:
        """List notifications — see :meth:`NotificationsResource.list`."""
        params: Dict[str, Any] = {}
        if page is not None:
            params["page"] = page
        if limit is not None:
            params["limit"] = limit
        if unread_only:
            params["unreadOnly"] = "true"
        return await self._client._request(
            "GET", "/api/notifications", params=params
        )

    async def mark_read(
        self, *, ids: Optional[List[int]] = None, all: bool = False
    ) -> Dict[str, Any]:
        """Mark read — see :meth:`NotificationsResource.mark_read`."""
        return await self._client._request(
            "PATCH", "/api/notifications", json=_selection(ids, all)
        )

    async def delete(
        self, *, ids: Optional[List[int]] = None, all: bool = False
    ) -> Dict[str, Any]:
        """Delete — see :meth:`NotificationsResource.delete`."""
        return await self._client._request(
            "DELETE", "/api/notifications", json=_selection(ids, all)
        )

    async def preferences(self) -> NotificationPreferences:
        """Preferences — see :meth:`NotificationsResource.preferences`."""
        return await self._client._request("GET", "/api/notifications/preferences")

    async def update_preferences(self, **prefs: bool) -> NotificationPreferences:
        """Update preferences — see :meth:`NotificationsResource.update_preferences`."""
        return await self._client._request(
            "PUT", "/api/notifications/preferences", json=prefs
        )


def _selection(ids: Optional[List[int]], all_: bool) -> Dict[str, Any]:
    """The body for a bulk mark-read or delete.

    The server takes either ``ids`` or ``{"all": true}`` and rejects a request
    carrying neither. Catching that here turns a round trip into a TypeError at
    the call site.
    """
    if all_ and ids:
        raise ValueError("Pass either ids or all=True, not both")
    if all_:
        return {"all": True}
    if ids:
        return {"ids": ids}
    raise ValueError("Pass ids=[...] or all=True")
