"""
Inbox resource for the BulkPublish SDK.

Read and answer direct messages, reviews and comment threads across your
connected channels. The Inbox is part of the Pro and Business plans: until it
is available to the account every method raises ``PermissionError`` (HTTP 403)
with ``response_body["error"]["code"] == "FEATURE_DISABLED"``; on a plan
without it, ``response_body["error"]["hint"]`` names the plan to upgrade to.
OAuth tokens need the ``inbox:read`` / ``inbox:write`` scopes (or ``full``).
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

_UNSET: Any = object()


def _list_params(
    status: Optional[str],
    kind: Optional[str],
    platforms: Optional[List[str]],
    channel_id: Optional[int],
    assigned: Optional[str],
    q: Optional[str],
    cursor: Optional[str],
    limit: Optional[int],
    offset: Optional[int] = None,
) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if offset is not None:
        params["offset"] = offset
    if status is not None:
        params["status"] = status
    if kind is not None:
        params["kind"] = kind
    if platforms:
        params["platforms"] = ",".join(platforms)
    if channel_id is not None:
        params["channelId"] = channel_id
    if assigned is not None:
        params["assigned"] = assigned
    if q is not None:
        params["q"] = q
    if cursor is not None:
        params["cursor"] = cursor
    if limit is not None:
        params["limit"] = limit
    return params


def _update_body(read: Optional[bool], status: Optional[str], snoozed_until: Any, assigned_user_id: Any) -> Dict[str, Any]:
    body: Dict[str, Any] = {}
    if read is not None:
        body["read"] = read
    if status is not None:
        body["status"] = status
    if snoozed_until is not _UNSET:
        body["snoozedUntil"] = snoozed_until
    if assigned_user_id is not _UNSET:
        body["assignedUserId"] = assigned_user_id
    return body


def _send_body(text: Optional[str], media_ids: Optional[List[int]], reply_to_message_id: Optional[int]) -> Dict[str, Any]:
    body: Dict[str, Any] = {}
    if text is not None:
        body["text"] = text
    if media_ids is not None:
        body["mediaIds"] = media_ids
    if reply_to_message_id is not None:
        body["replyToMessageId"] = reply_to_message_id
    return body


class InboxResource:
    """Operations on Inbox conversations.

    Access via ``client.inbox``:

    Example::

        bp = BulkPublish("bp_key")
        page = bp.inbox.list_conversations(kind="dm")
        convo = page["conversations"][0]
        thread = bp.inbox.list_messages(convo["id"])
        bp.inbox.send_message(convo["id"], text="Thanks for reaching out!")
        bp.inbox.update_conversation(convo["id"], read=True)
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list_conversations(
        self,
        *,
        status: Optional[str] = None,
        kind: Optional[str] = None,
        platforms: Optional[List[str]] = None,
        channel_id: Optional[int] = None,
        assigned: Optional[str] = None,
        q: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        """List conversations, newest activity first.

        Args:
            status: ``"open"`` (default), ``"archived"`` or ``"snoozed"``.
            kind: ``"dm"``, ``"review"`` or ``"comment"``. Omit for all.
            platforms: Platform names; matches any of them.
            channel_id: Only this channel.
            assigned: ``"me"``, ``"unassigned"``, or a teammate's user id.
            q: Search the participant's name and handle and the message text
                (2 to 100 characters).
            cursor: ``nextCursor`` from the previous page (opaque).
            limit: Page size, 1 to 100 (default 50).
            offset: Skip this many conversations, for numbered pages. Ignored
                when ``cursor`` is sent.

        Returns:
            ``{"conversations": [...], "nextCursor": str | None, "offset": int,
            "total": int}``. ``total`` counts every match across all pages.
        """
        return self._client._request(
            "GET",
            "/api/inbox/conversations",
            params=_list_params(status, kind, platforms, channel_id, assigned, q, cursor, limit, offset),
        )

    def update_conversation(
        self,
        conversation_id: int,
        *,
        read: Optional[bool] = None,
        status: Optional[str] = None,
        snoozed_until: Any = _UNSET,
        assigned_user_id: Any = _UNSET,
    ) -> Dict[str, Any]:
        """Mark read/unread, archive or reopen, snooze, or assign a conversation.

        Nothing is sent to the other person and nothing changes on the platform.

        Args:
            conversation_id: The conversation id.
            read: ``True`` marks it read, ``False`` unread.
            status: ``"archived"`` or ``"open"``. Either clears a snooze.
            snoozed_until: ISO timestamp in the future, at most 90 days out;
                ``None`` unsnoozes.
            assigned_user_id: A workspace member's user id (they are notified);
                ``None`` unassigns.

        Returns:
            ``{"success": True}``.
        """
        return self._client._request(
            "PATCH",
            f"/api/inbox/conversations/{conversation_id}",
            json=_update_body(read, status, snoozed_until, assigned_user_id),
        )

    def list_messages(self, conversation_id: int) -> Dict[str, Any]:
        """The newest 500 messages of a conversation, oldest first.

        Reading does not mark the conversation read; use
        ``update_conversation(id, read=True)`` for that.

        Returns:
            ``{"conversationId": int, "messages": [...]}``.
        """
        return self._client._request("GET", f"/api/inbox/conversations/{conversation_id}/messages")

    def send_message(
        self,
        conversation_id: int,
        *,
        text: Optional[str] = None,
        media_ids: Optional[List[int]] = None,
        reply_to_message_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Send a reply to the person on the platform, immediately.

        It cannot be unsent. Raises ``ConflictError`` (409,
        ``RECONNECT_REQUIRED``) when the channel must be reconnected, and
        ``ValidationError`` (422) when the platform's reply window has closed
        or an attachment is not accepted.

        Args:
            conversation_id: The conversation id.
            text: Up to 4,000 characters.
            media_ids: Up to 4 media library file ids.
            reply_to_message_id: Comment threads only: the incoming message to answer.

        Returns:
            ``{"success": True, "messageId": str}``.
        """
        return self._client._request(
            "POST",
            f"/api/inbox/conversations/{conversation_id}/messages",
            json=_send_body(text, media_ids, reply_to_message_id),
        )


class AsyncInboxResource:
    """Async version of :class:`InboxResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list_conversations(
        self,
        *,
        status: Optional[str] = None,
        kind: Optional[str] = None,
        platforms: Optional[List[str]] = None,
        channel_id: Optional[int] = None,
        assigned: Optional[str] = None,
        q: Optional[str] = None,
        cursor: Optional[str] = None,
        limit: Optional[int] = None,
        offset: Optional[int] = None,
    ) -> Dict[str, Any]:
        """List conversations — see :meth:`InboxResource.list_conversations`."""
        return await self._client._request(
            "GET",
            "/api/inbox/conversations",
            params=_list_params(status, kind, platforms, channel_id, assigned, q, cursor, limit, offset),
        )

    async def update_conversation(
        self,
        conversation_id: int,
        *,
        read: Optional[bool] = None,
        status: Optional[str] = None,
        snoozed_until: Any = _UNSET,
        assigned_user_id: Any = _UNSET,
    ) -> Dict[str, Any]:
        """Update a conversation — see :meth:`InboxResource.update_conversation`."""
        return await self._client._request(
            "PATCH",
            f"/api/inbox/conversations/{conversation_id}",
            json=_update_body(read, status, snoozed_until, assigned_user_id),
        )

    async def list_messages(self, conversation_id: int) -> Dict[str, Any]:
        """List messages — see :meth:`InboxResource.list_messages`."""
        return await self._client._request("GET", f"/api/inbox/conversations/{conversation_id}/messages")

    async def send_message(
        self,
        conversation_id: int,
        *,
        text: Optional[str] = None,
        media_ids: Optional[List[int]] = None,
        reply_to_message_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Send a reply — see :meth:`InboxResource.send_message`."""
        return await self._client._request(
            "POST",
            f"/api/inbox/conversations/{conversation_id}/messages",
            json=_send_body(text, media_ids, reply_to_message_id),
        )
