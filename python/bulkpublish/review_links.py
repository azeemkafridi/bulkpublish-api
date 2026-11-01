"""Client review links covering a batch of posts at once."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import ReviewLink

# The list is paged server-side (50 per page by default, at most 100).
_PAGE_MAX = 100


def _page_params(page: Optional[int], limit: Optional[int]) -> Dict[str, Any]:
    params: Dict[str, Any] = {}
    if page is not None:
        params["page"] = page
    if limit is not None:
        params["limit"] = limit
    return params


class ReviewLinksResource:
    """Operations on client review links (``client.review_links``).

    The multi-post counterpart of ``posts.share()`` / ``posts.unshare()``:
    one link, several posts — hand a client one URL to review everything
    queued for them, instead of one link per post.

    Pro and Business only: the single-seat plans (Free, Lifetime) have no
    client collaboration, and every method here raises the 403
    ``FEATURE_DISABLED`` error (with ``plan`` and ``upgrade: true``) for them.
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self, *, page: Optional[int] = None, limit: Optional[int] = None) -> List[ReviewLink]:
        """Review links in the organization, newest first, with each one's post count.

        With neither ``page`` nor ``limit``, every link is returned (the pages
        are walked for you, 100 at a time). With either, only that page is
        returned: 50 per page by default, ``limit`` up to 100.
        """
        if page is not None or limit is not None:
            return self._client._request("GET", "/api/review-links", params=_page_params(page, limit))["reviewLinks"]
        out: List[ReviewLink] = []
        current = 1
        while True:
            body = self._client._request("GET", "/api/review-links", params={"page": current, "limit": _PAGE_MAX})
            rows = body["reviewLinks"]
            out.extend(rows)
            if not rows or current * _PAGE_MAX >= int(body.get("total", 0)):
                return out
            current += 1

    def create(self, *, post_ids: List[int], name: Optional[str] = None) -> Dict[str, Any]:
        """Create a review link covering ``post_ids`` (up to 50, all must belong to your organization).

        Unlike a single post's link this is never regenerated in place —
        every call mints a new link and a new token.

        Returns:
            ``{"reviewLink", "url"}``.
        """
        body: Dict[str, Any] = {"postIds": post_ids}
        if name is not None:
            body["name"] = name
        return self._client._request("POST", "/api/review-links", json=body)

    def delete(self, review_link_id: int) -> Dict[str, Any]:
        """Revoke a review link. The posts it covered are untouched."""
        return self._client._request("DELETE", f"/api/review-links/{review_link_id}")


class AsyncReviewLinksResource:
    """Async variant of :class:`ReviewLinksResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self, *, page: Optional[int] = None, limit: Optional[int] = None) -> List[ReviewLink]:
        if page is not None or limit is not None:
            return (await self._client._request("GET", "/api/review-links", params=_page_params(page, limit)))["reviewLinks"]
        out: List[ReviewLink] = []
        current = 1
        while True:
            body = await self._client._request("GET", "/api/review-links", params={"page": current, "limit": _PAGE_MAX})
            rows = body["reviewLinks"]
            out.extend(rows)
            if not rows or current * _PAGE_MAX >= int(body.get("total", 0)):
                return out
            current += 1

    async def create(self, *, post_ids: List[int], name: Optional[str] = None) -> Dict[str, Any]:
        body: Dict[str, Any] = {"postIds": post_ids}
        if name is not None:
            body["name"] = name
        return await self._client._request("POST", "/api/review-links", json=body)

    async def delete(self, review_link_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/review-links/{review_link_id}")
