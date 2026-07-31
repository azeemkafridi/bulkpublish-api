"""
Posts resource for the BulkPublish SDK.

Provides methods to create, read, update, delete, publish, and manage
social-media posts through the BulkPublish API.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional, Sequence

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import BulkOperationResult, Post, PostList, PostMetrics, QueueSlot


class PostsResource:
    """Operations on social-media posts.

    Access via ``client.posts``:

    Example::

        bp = BulkPublish("bp_key")
        posts = bp.posts.list(status="published", limit=5)
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    # -- List -----------------------------------------------------------------

    def list(
        self,
        *,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: Optional[int] = None,
        limit: Optional[int] = None,
        channel_id: Optional[str] = None,
        label_id: Optional[str] = None,
        label_ids: Optional[List[str]] = None,
        label_mode: Optional[str] = None,
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        sort_by: Optional[str] = None,
        sort_order: Optional[str] = None,
        approval_status: Optional[str] = None,
    ) -> PostList:
        """List posts with optional filtering and pagination.

        Args:
            status: Filter by status (``"draft"``, ``"scheduled"``,
                ``"published"``, ``"failed"``).
            search: Full-text search across post content.
            page: Page number (1-based).
            limit: Results per page (default 20, max 100).
            channel_id: Filter to a specific channel.
            label_id: Filter by a single label ID.
            label_ids: Filter by multiple label IDs.
            label_mode: How to combine label_ids — ``"any"`` or ``"all"``.
            from_date: ISO-8601 start date filter.
            to_date: ISO-8601 end date filter.
            sort_by: Field to sort by (e.g. ``"scheduledAt"``, ``"createdAt"``).
            sort_order: ``"asc"`` or ``"desc"``.
            approval_status: Filter by team approval state — one of ``"none"``,
                ``"pending"``, ``"approved"``, ``"rejected"`` (e.g.
                ``"pending"`` for the approval queue).

        Returns:
            A dict with ``posts``, ``total``, ``page``, ``limit``, and
            ``totalPages`` keys.

        Example::

            # Fetch the 10 most recent scheduled posts
            result = bp.posts.list(status="scheduled", limit=10, sort_by="scheduledAt", sort_order="desc")
            for post in result["posts"]:
                print(post["content"][:80], post["scheduledAt"])

            # Search posts containing "launch"
            result = bp.posts.list(search="launch")
        """
        params: Dict[str, Any] = {}
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        if page is not None:
            params["page"] = page
        if limit is not None:
            params["limit"] = limit
        if channel_id is not None:
            params["channelId"] = channel_id
        if label_id is not None:
            params["labelId"] = label_id
        if label_ids is not None:
            params["labelIds"] = ",".join(label_ids)
        if label_mode is not None:
            params["labelMode"] = label_mode
        if from_date is not None:
            params["from"] = from_date
        if to_date is not None:
            params["to"] = to_date
        if sort_by is not None:
            params["sortBy"] = sort_by
        if sort_order is not None:
            params["sortOrder"] = sort_order
        if approval_status is not None:
            params["approvalStatus"] = approval_status
        return self._client._request("GET", "/api/posts", params=params)

    # -- Get ------------------------------------------------------------------

    def get(self, post_id: str) -> Post:
        """Get a single post by ID.

        Args:
            post_id: The post's unique identifier.

        Returns:
            The full post object.

        Raises:
            NotFoundError: If the post does not exist.

        Example::

            post = bp.posts.get("post_abc123")
            print(post["content"], post["status"])
        """
        return self._client._request("GET", f"/api/posts/{post_id}")

    # -- Create ---------------------------------------------------------------

    def create(
        self,
        *,
        content: str,
        channels: List[Dict[str, str]],
        status: str = "draft",
        scheduled_at: Optional[str] = None,
        timezone: Optional[str] = None,
        media_files: Optional[List[str]] = None,
        label_ids: Optional[List[str]] = None,
        post_format: Optional[str] = None,
        platform_specific: Optional[Dict[str, Any]] = None,
        platform_content: Optional[Dict[str, Any]] = None,
        delete_media_after_publish: Optional[bool] = None,
        thread_parts: Optional[List[Dict[str, Any]]] = None,
        post_type_overrides: Optional[Dict[str, str]] = None,
        request_approval: Optional[bool] = None,
        link_tracking_override: Optional[bool] = None,
    ) -> Post:
        """Create a new post.

        Args:
            content: The text content of the post.
            channels: Target channels, each a dict with ``channelId`` and
                ``platform`` keys.
            status: Initial status — ``"draft"`` or ``"scheduled"``.
            scheduled_at: ISO-8601 datetime for scheduled publishing.
            timezone: IANA timezone (e.g. ``"America/New_York"``).
            media_files: List of media file IDs to attach.
            label_ids: Label IDs to tag the post with.
            post_format: Format hint (e.g. ``"thread"``, ``"carousel"``).
            platform_specific: Per-platform settings. Required fields by platform:

                - **youtube**: ``{"title": "..."}`` (required, 1-100 chars).
                  Optional: ``privacyStatus``, ``categoryId``, ``tags``, ``playlistId``, ``thumbnailUrl``, ``madeForKids``
                - **pinterest**: ``{"title": "..."}`` (required, 1-100 chars).
                  Optional: ``boardId``, ``description``, ``link``
                - **instagram**: Optional: ``collaborators``, ``trialReel``, ``thumbnailTimestamp``
                - **tiktok**: Optional: ``privacyLevel`` (SELF_ONLY|PUBLIC|FRIENDS), ``disableDuet``, ``disableStitch``
                - **linkedin**: Optional: ``title``, ``description``, ``url`` (required for article type)
                - **gmb**: Optional: ``ctaType``, ``ctaUrl``, ``eventTitle``, ``startDate``, ``endDate``
                - **mastodon**: Optional: ``visibility``, ``spoilerText``, ``language``

            platform_content: Per-platform content overrides for different char limits
                (bluesky: 300, pinterest/threads/mastodon: 500, etc.).
            delete_media_after_publish: Remove attached media after publishing.
            thread_parts: Parts of a thread post (min 2 required).
            post_type_overrides: Per-platform post type. Valid types:

                - facebook: ``post``, ``reel``, ``story``
                - instagram: ``feed_photo``, ``feed_video``, ``reel``, ``story``, ``carousel``
                - youtube: ``video``, ``short`` (video file required)
                - tiktok: ``video``, ``photo_slideshow``
                - linkedin: ``post``, ``multi_image``, ``pdf_carousel``, ``article``
                - pinterest: ``pin``, ``video_pin``, ``carousel``
                - threads: ``text``, ``image``, ``video``, ``carousel``
                - gmb: ``standard``, ``event``, ``offer``

            request_approval: Set ``True`` to hold a scheduled post for team
                approval (``approvalStatus`` becomes ``"pending"``; default
                ``False``). Forced on server-side for roles without
                post:publish (contributors), regardless of this flag.

            link_tracking_override: Per-post override for link tracking
                (bulkpubli.sh). ``True`` forces links in this post to be
                shortened and their clicks counted, ``False`` forces them to
                publish as written, and ``None`` (the default) inherits the
                organization's Link Tracking setting. Shortening happens at
                publish time, per channel, so two accounts on the same platform
                get distinct codes; it is skipped for a channel when the
                rewrite would push the post past that platform's character
                limit (a short URL is 28 characters and can be longer than the
                link it replaces).

        Returns:
            The newly created post object.

        Raises:
            ValidationError: If required fields are missing or invalid.

        Important:
            - **YouTube and TikTok require video files.** Do not include them for image-only posts.
            - **Instagram defaults to feed_photo.** Set ``post_type_overrides`` for video content.
            - **Pinterest requires a title** in ``platform_specific``.

        Example::

            # Simple draft post
            post = bp.posts.create(
                content="Hello world!",
                channels=[{"channelId": "1", "platform": "facebook"}],
            )

            # Video to YouTube + image to Instagram
            video = bp.media.upload("./video.mp4")
            post = bp.posts.create(
                content="Check this out!",
                channels=[
                    {"channelId": "1", "platform": "youtube"},
                    {"channelId": "2", "platform": "instagram"},
                ],
                media_files=[video["file"]["id"]],
                post_type_overrides={"instagram": "reel"},
                platform_specific={"youtube": {"title": "My Video Title"}},
            )
        """
        body: Dict[str, Any] = {
            "content": content,
            "channels": channels,
            "status": status,
        }
        if scheduled_at is not None:
            body["scheduledAt"] = scheduled_at
        if timezone is not None:
            body["timezone"] = timezone
        if media_files is not None:
            body["mediaFiles"] = media_files
        if label_ids is not None:
            body["labels"] = label_ids
        if post_format is not None:
            body["postFormat"] = post_format
        if platform_specific is not None:
            body["platformSpecific"] = platform_specific
        if platform_content is not None:
            body["platformContent"] = platform_content
        if delete_media_after_publish is not None:
            body["deleteMediaAfterPublish"] = delete_media_after_publish
        if thread_parts is not None:
            body["threadParts"] = thread_parts
        if post_type_overrides is not None:
            body["postTypeOverrides"] = post_type_overrides
        if request_approval is not None:
            body["requestApproval"] = request_approval
        if link_tracking_override is not None:
            body["linkTrackingOverride"] = link_tracking_override
        return self._client._request("POST", "/api/posts", json=body)

    # -- Update ---------------------------------------------------------------

    def update(self, post_id: str, **fields: Any) -> Post:
        """Update an existing post.

        Pass any combination of the fields accepted by :meth:`create` as
        keyword arguments.  Only the fields you provide will be changed.

        Args:
            post_id: The post's unique identifier.
            **fields: Fields to update.  Use snake_case names — they are
                converted to camelCase automatically (e.g.
                ``scheduled_at`` becomes ``scheduledAt``).  Pass
                ``status="draft"`` or ``status="scheduled"`` to move the post
                between those states — ``"scheduled"`` requires a future
                ``scheduled_at`` (in this call or already stored) and at least
                one channel; ``"draft"`` unschedules it.  Any other status
                value is rejected.  Omit ``status`` to leave it unchanged
                (failed/partial posts still auto-reset to draft on edit).  To
                publish immediately, use :meth:`publish` instead.

        Note:
            Fields passed as ``None`` are dropped, not sent as JSON ``null``.
            So a nullable field cannot be *cleared* through this method —
            ``update(post_id, link_tracking_override=None)`` leaves the
            existing override in place rather than reverting the post to the
            organization default. Pass an explicit ``True``/``False``, or use
            the REST endpoint directly to send ``null``.

        Returns:
            The updated post object.

        Raises:
            NotFoundError: If the post does not exist.

        Example::

            bp.posts.update("post_abc123", content="Updated text!", status="scheduled",
                            scheduled_at="2026-04-15T10:00:00Z")
        """
        body = _snake_to_camel_dict(fields)
        return self._client._request("PUT", f"/api/posts/{post_id}", json=body)

    # -- Delete ---------------------------------------------------------------

    def delete(self, post_id: str) -> Dict[str, Any]:
        """Delete a post.

        Args:
            post_id: The post's unique identifier.

        Returns:
            Confirmation dict (typically ``{"success": true}``).

        Raises:
            NotFoundError: If the post does not exist.

        Example::

            bp.posts.delete("post_abc123")
        """
        return self._client._request("DELETE", f"/api/posts/{post_id}")

    # -- Publish now ----------------------------------------------------------

    def publish(self, post_id: str) -> Post:
        """Publish a post immediately (bypassing its schedule).

        Requires a role with post:publish — contributors get a 403 with code
        ``APPROVAL_REQUIRED`` and must submit the post for approval instead
        (create/update with ``request_approval``, then a teammate approves).
        Publishing a pending/rejected post as an approver implicitly approves
        it.

        Args:
            post_id: The post's unique identifier.

        Returns:
            The post object with updated status.

        Example::

            post = bp.posts.create(content="Going live!", channels=[...])
            bp.posts.publish(post["id"])
        """
        return self._client._request("POST", f"/api/posts/{post_id}/publish")

    # -- Retry ----------------------------------------------------------------

    def retry(self, post_id: str) -> Post:
        """Retry publishing a failed post.

        Args:
            post_id: The post's unique identifier (must have ``"failed"`` status).

        Returns:
            The post object, now re-queued for publishing.

        Example::

            failed = bp.posts.list(status="failed")
            for post in failed["posts"]:
                bp.posts.retry(post["id"])
        """
        return self._client._request("POST", f"/api/posts/{post_id}/retry")

    # -- Approval -------------------------------------------------------------

    def approve(self, post_id: str) -> Post:
        """Approve a pending post.

        Requires a role with post:approve (owner, admin, approver). Releases a
        post with ``approvalStatus`` ``"pending"``: it publishes at its
        scheduled time, or immediately if that time has already passed. The
        author is notified in-app.

        Args:
            post_id: The post's unique identifier.

        Returns:
            The approved post object.

        Raises:
            ValidationError: If the post is not awaiting approval (400).
            PermissionError: If the role lacks post:approve (403).
            NotFoundError: If the post does not exist (404).

        Example::

            queue = bp.posts.list(approval_status="pending")
            for post in queue["posts"]:
                bp.posts.approve(post["id"])
        """
        return self._client._request("POST", f"/api/posts/{post_id}/approve")

    def reject(self, post_id: str, *, reason: Optional[str] = None) -> Post:
        """Reject a pending post.

        Requires a role with post:approve. The post returns to draft with
        ``approvalStatus`` ``"rejected"`` and the optional reason; the author
        is notified and can edit + reschedule to resubmit for approval.

        Args:
            post_id: The post's unique identifier.
            reason: Optional reason, max 2000 chars. Shown to the author
                (in-app notification + on the post).

        Returns:
            The rejected post object.

        Raises:
            ValidationError: If the post is not awaiting approval (400).
            PermissionError: If the role lacks post:approve (403).
            NotFoundError: If the post does not exist (404).

        Example::

            bp.posts.reject("42", reason="Please tone down the CTA.")
        """
        body: Dict[str, Any] = {}
        if reason is not None:
            body["reason"] = reason
        return self._client._request("POST", f"/api/posts/{post_id}/reject", json=body)

    # -- Metrics --------------------------------------------------------------

    def metrics(self, post_id: str) -> PostMetrics:
        """Get engagement metrics for a published post.

        Args:
            post_id: The post's unique identifier.

        Returns:
            Metrics dict with likes, comments, shares, impressions, etc.

        Example::

            metrics = bp.posts.metrics("post_abc123")
            print(f"Likes: {metrics['likes']}, Impressions: {metrics['impressions']}")
        """
        return self._client._request("GET", f"/api/posts/{post_id}/metrics")

    # -- Story ----------------------------------------------------------------

    def publish_as_story(self, post_id: str) -> Post:
        """Publish a post as a story (Instagram/Facebook stories).

        Args:
            post_id: The post's unique identifier.

        Returns:
            The updated post object.

        Example::

            bp.posts.publish_as_story("post_abc123")
        """
        return self._client._request("POST", f"/api/posts/{post_id}/story")

    # -- Bulk operations ------------------------------------------------------

    def bulk(
        self,
        *,
        action: str,
        post_ids: List[str],
        scheduled_at: Optional[str] = None,
    ) -> BulkOperationResult:
        """Perform a bulk operation on multiple posts.

        Args:
            action: One of ``"delete"``, ``"retry"``, or ``"reschedule"``.
            post_ids: List of post IDs to operate on.
            scheduled_at: Required when ``action`` is ``"reschedule"`` — the
                new ISO-8601 datetime.

        Returns:
            Result dict with ``success`` and ``failed`` counts.

        Example::

            # Retry all failed posts
            failed = bp.posts.list(status="failed", limit=100)
            ids = [p["id"] for p in failed["posts"]]
            result = bp.posts.bulk(action="retry", post_ids=ids)
            print(f"Retried {result['success']}, failed {result['failed']}")

            # Reschedule posts
            bp.posts.bulk(
                action="reschedule",
                post_ids=["post_1", "post_2"],
                scheduled_at="2026-05-01T12:00:00Z",
            )
        """
        body: Dict[str, Any] = {"action": action, "postIds": post_ids}
        if scheduled_at is not None:
            body["scheduledAt"] = scheduled_at
        return self._client._request("POST", "/api/posts/bulk", json=body)

    # -- Queue slot -----------------------------------------------------------

    def queue_slot(
        self,
        *,
        timezone: Optional[str] = None,
    ) -> QueueSlot:
        """Get the organization's next optimal publishing time slot.

        Args:
            timezone: IANA timezone for the slot calculation (defaults to UTC).

        Returns:
            Dict with ``suggestedTime`` and ``timezone``.

        Example::

            slot = bp.posts.queue_slot(timezone="America/New_York")
            print(f"Best time to post: {slot['suggestedTime']}")
        """
        params: Dict[str, Any] = {}
        if timezone is not None:
            params["timezone"] = timezone
        return self._client._request("GET", "/api/posts/queue-slot", params=params)


class AsyncPostsResource:
    """Async version of :class:`PostsResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            posts = await bp.posts.list(status="published")
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self, **kwargs: Any) -> PostList:
        """List posts — see :meth:`PostsResource.list` for full docs."""
        params = _build_list_params(kwargs)
        return await self._client._request("GET", "/api/posts", params=params)

    async def get(self, post_id: str) -> Post:
        """Get a post — see :meth:`PostsResource.get` for full docs."""
        return await self._client._request("GET", f"/api/posts/{post_id}")

    async def create(self, **kwargs: Any) -> Post:
        """Create a post — see :meth:`PostsResource.create` for full docs."""
        body = _build_create_body(kwargs)
        return await self._client._request("POST", "/api/posts", json=body)

    async def update(self, post_id: str, **fields: Any) -> Post:
        """Update a post — see :meth:`PostsResource.update` for full docs."""
        body = _snake_to_camel_dict(fields)
        return await self._client._request("PUT", f"/api/posts/{post_id}", json=body)

    async def delete(self, post_id: str) -> Dict[str, Any]:
        """Delete a post — see :meth:`PostsResource.delete` for full docs."""
        return await self._client._request("DELETE", f"/api/posts/{post_id}")

    async def publish(self, post_id: str) -> Post:
        """Publish a post now — see :meth:`PostsResource.publish`."""
        return await self._client._request("POST", f"/api/posts/{post_id}/publish")

    async def retry(self, post_id: str) -> Post:
        """Retry a failed post — see :meth:`PostsResource.retry`."""
        return await self._client._request("POST", f"/api/posts/{post_id}/retry")

    async def approve(self, post_id: str) -> Post:
        """Approve a pending post — see :meth:`PostsResource.approve`."""
        return await self._client._request("POST", f"/api/posts/{post_id}/approve")

    async def reject(self, post_id: str, *, reason: Optional[str] = None) -> Post:
        """Reject a pending post — see :meth:`PostsResource.reject`."""
        body: Dict[str, Any] = {}
        if reason is not None:
            body["reason"] = reason
        return await self._client._request("POST", f"/api/posts/{post_id}/reject", json=body)

    async def metrics(self, post_id: str) -> PostMetrics:
        """Get post metrics — see :meth:`PostsResource.metrics`."""
        return await self._client._request("GET", f"/api/posts/{post_id}/metrics")

    async def publish_as_story(self, post_id: str) -> Post:
        """Publish as story — see :meth:`PostsResource.publish_as_story`."""
        return await self._client._request("POST", f"/api/posts/{post_id}/story")

    async def bulk(self, *, action: str, post_ids: List[str], scheduled_at: Optional[str] = None) -> BulkOperationResult:
        """Bulk operation — see :meth:`PostsResource.bulk`."""
        body: Dict[str, Any] = {"action": action, "postIds": post_ids}
        if scheduled_at is not None:
            body["scheduledAt"] = scheduled_at
        return await self._client._request("POST", "/api/posts/bulk", json=body)

    async def queue_slot(self, *, timezone: Optional[str] = None) -> QueueSlot:
        """Queue slot — see :meth:`PostsResource.queue_slot`."""
        params: Dict[str, Any] = {}
        if timezone is not None:
            params["timezone"] = timezone
        return await self._client._request("GET", "/api/posts/queue-slot", params=params)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_SNAKE_TO_CAMEL = {
    "scheduled_at": "scheduledAt",
    "media_files": "mediaFiles",
    "label_ids": "labels",
    "post_format": "postFormat",
    "platform_specific": "platformSpecific",
    "platform_content": "platformContent",
    "delete_media_after_publish": "deleteMediaAfterPublish",
    "thread_parts": "threadParts",
    "post_type_overrides": "postTypeOverrides",
    "channel_id": "channelId",
    "label_id": "labelId",
    "label_mode": "labelMode",
    "from_date": "from",
    "to_date": "to",
    "sort_by": "sortBy",
    "sort_order": "sortOrder",
    "post_ids": "postIds",
    "request_approval": "requestApproval",
    "approval_status": "approvalStatus",
    "link_tracking_override": "linkTrackingOverride",
}


def _snake_to_camel_dict(d: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a dict with snake_case keys to camelCase using the known mapping."""
    return {_SNAKE_TO_CAMEL.get(k, k): v for k, v in d.items() if v is not None}


def _build_list_params(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Build query params dict from list() kwargs."""
    params: Dict[str, Any] = {}
    for k, v in kwargs.items():
        if v is None:
            continue
        camel = _SNAKE_TO_CAMEL.get(k, k)
        if k == "label_ids" and isinstance(v, list):
            params[camel] = ",".join(v)
        else:
            params[camel] = v
    return params


def _build_create_body(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    """Build JSON body from create() kwargs."""
    return _snake_to_camel_dict(kwargs)
