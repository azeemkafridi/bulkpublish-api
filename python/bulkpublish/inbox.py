"""
Inbox resource for the BulkPublish SDK.

Read and answer direct messages, reviews, comment threads and mentions across
your connected channels, leave internal notes for your team, label
conversations, and keep saved replies. The Inbox is part of the Pro and Business plans: until it
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
    label_id: Optional[int] = None,
    label_ids: Optional[List[int]] = None,
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
    if label_id is not None:
        params["labelId"] = label_id
    if label_ids:
        params["labelIds"] = ",".join(str(i) for i in label_ids)
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
        bp.inbox.add_note(convo["id"], text="Answered, refund on its way.")
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
        label_id: Optional[int] = None,
        label_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """List conversations, newest activity first.

        Args:
            status: ``"open"`` (default), ``"archived"`` or ``"snoozed"``.
            kind: ``"dm"``, ``"review"``, ``"comment"`` or ``"mention"`` (a
                post by someone else that mentions your account). Omit for all.
                A kind not yet available to the account is ignored.
            platforms: Platform names; matches any of them.
            channel_id: Only this channel.
            assigned: ``"me"``, ``"unassigned"``, or a teammate's user id.
            q: Search the participant's name and handle, the message text and
                your team's internal notes (2 to 100 characters).
            cursor: ``nextCursor`` from the previous page (opaque).
            limit: Page size, 1 to 100 (default 50).
            offset: Skip this many conversations, for numbered pages. Ignored
                when ``cursor`` is sent.
            label_id: Only conversations carrying this inbox label. Combined
                with ``label_ids``, both must match.
            label_ids: Inbox label ids; matches conversations carrying ANY of
                them (at most 50 are used).

        Returns:
            ``{"conversations": [...], "nextCursor": str | None, "offset": int,
            "total": int}``. ``total`` counts every match across all pages.
            Each conversation carries ``labels`` (``[{id, name, color}]``).
        """
        return self._client._request(
            "GET",
            "/api/inbox/conversations",
            params=_list_params(
                status, kind, platforms, channel_id, assigned, q, cursor, limit, offset, label_id, label_ids
            ),
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
        ``update_conversation(id, read=True)`` for that. Your team's internal
        notes come back inline with ``direction: "note"`` and their ``author``.

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

    def add_note(self, conversation_id: int, *, text: str) -> Dict[str, Any]:
        """Leave an internal note on a conversation for your team.

        It is never sent to the other person. The author is the person the API
        key or OAuth app acts for. Write ``@[Display Name](user:USER_ID)`` to
        mention a member of the workspace.

        Args:
            conversation_id: The conversation id.
            text: 1 to 4,000 characters.

        Returns:
            ``{"success": True, "message": {"id", "direction": "note", "text",
            "sentAt", "authorUserId", "author"}}``.
        """
        return self._client._request(
            "POST", f"/api/inbox/conversations/{conversation_id}/notes", json={"text": text}
        )

    def set_labels(self, conversation_id: int, label_ids: List[int]) -> Dict[str, Any]:
        """Replace a conversation's inbox labels with exactly ``label_ids``.

        ``[]`` removes them all; at most 20. Every id must be a label of type
        ``inbox`` (``bp.labels.list(type="inbox")``); if any is not, nothing
        changes and ``ValidationError`` (422) is raised.

        Returns:
            ``{"success": True, "labelIds": [...]}``.
        """
        return self._client._request(
            "PUT", f"/api/inbox/conversations/{conversation_id}/labels", json={"labelIds": label_ids}
        )

    def list_saved_replies(self) -> Dict[str, Any]:
        """The workspace's saved replies, sorted by name.

        Returns:
            ``{"savedReplies": [{id, name, body, createdBy, updatedAt}],
            "variables": [{key, description}]}``. Placeholders such as
            ``{{first_name}}`` are returned as written; fill them in yourself
            before sending.
        """
        return self._client._request("GET", "/api/inbox/saved-replies")

    def create_saved_reply(self, *, name: str, body: str) -> Dict[str, Any]:
        """Add a saved reply for the whole workspace (at most 200).

        Args:
            name: 1 to 100 characters, unique in the workspace (409 otherwise).
            body: 1 to 4,000 characters; may contain ``{{variable}}`` placeholders.
        """
        return self._client._request("POST", "/api/inbox/saved-replies", json={"name": name, "body": body})

    def update_saved_reply(self, saved_reply_id: int, *, name: str, body: str) -> Dict[str, Any]:
        """Replace a saved reply's name and text; send both."""
        return self._client._request(
            "PUT", f"/api/inbox/saved-replies/{saved_reply_id}", json={"name": name, "body": body}
        )

    def delete_saved_reply(self, saved_reply_id: int) -> Dict[str, Any]:
        """Delete a saved reply. Replies already sent with its text are not affected."""
        return self._client._request("DELETE", f"/api/inbox/saved-replies/{saved_reply_id}")


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
        label_id: Optional[int] = None,
        label_ids: Optional[List[int]] = None,
    ) -> Dict[str, Any]:
        """List conversations — see :meth:`InboxResource.list_conversations`."""
        return await self._client._request(
            "GET",
            "/api/inbox/conversations",
            params=_list_params(
                status, kind, platforms, channel_id, assigned, q, cursor, limit, offset, label_id, label_ids
            ),
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

    async def add_note(self, conversation_id: int, *, text: str) -> Dict[str, Any]:
        """Add a note — see :meth:`InboxResource.add_note`."""
        return await self._client._request(
            "POST", f"/api/inbox/conversations/{conversation_id}/notes", json={"text": text}
        )

    async def set_labels(self, conversation_id: int, label_ids: List[int]) -> Dict[str, Any]:
        """Set labels — see :meth:`InboxResource.set_labels`."""
        return await self._client._request(
            "PUT", f"/api/inbox/conversations/{conversation_id}/labels", json={"labelIds": label_ids}
        )

    async def list_saved_replies(self) -> Dict[str, Any]:
        """List saved replies — see :meth:`InboxResource.list_saved_replies`."""
        return await self._client._request("GET", "/api/inbox/saved-replies")

    async def create_saved_reply(self, *, name: str, body: str) -> Dict[str, Any]:
        """Create a saved reply — see :meth:`InboxResource.create_saved_reply`."""
        return await self._client._request("POST", "/api/inbox/saved-replies", json={"name": name, "body": body})

    async def update_saved_reply(self, saved_reply_id: int, *, name: str, body: str) -> Dict[str, Any]:
        """Update a saved reply — see :meth:`InboxResource.update_saved_reply`."""
        return await self._client._request(
            "PUT", f"/api/inbox/saved-replies/{saved_reply_id}", json={"name": name, "body": body}
        )

    async def delete_saved_reply(self, saved_reply_id: int) -> Dict[str, Any]:
        """Delete a saved reply — see :meth:`InboxResource.delete_saved_reply`."""
        return await self._client._request("DELETE", f"/api/inbox/saved-replies/{saved_reply_id}")
