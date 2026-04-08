"""
Webhooks resource for the BulkPublish SDK.

Provides methods to create, list, update, and delete webhook subscriptions
that receive real-time notifications about events in your account.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Webhook


class WebhooksResource:
    """Operations on webhook subscriptions.

    Access via ``client.webhooks``:

    Example::

        bp = BulkPublish("bp_key")
        webhooks = bp.webhooks.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[Webhook]:
        """List all webhook subscriptions.

        Returns:
            List of webhook objects.

        Example::

            webhooks = bp.webhooks.list()
            for wh in webhooks:
                print(f"{wh['url']} -> {wh['events']}")
        """
        return self._client._request("GET", "/api/webhooks")

    def create(
        self,
        *,
        url: str,
        events: List[str],
        secret: Optional[str] = None,
    ) -> Webhook:
        """Create a new webhook subscription.

        Args:
            url: The HTTPS endpoint to receive POST requests.
            events: List of event types to subscribe to (e.g.
                ``["post.published", "post.failed"]``).
            secret: Optional shared secret for HMAC signature verification.

        Returns:
            The newly created webhook object.

        Raises:
            ValidationError: If the URL or events are invalid.

        Example::

            webhook = bp.webhooks.create(
                url="https://example.com/hooks/bulkpublish",
                events=["post.published", "post.failed"],
                secret="whsec_my_secret_key",
            )
            print(webhook["id"])
        """
        body: Dict[str, Any] = {"url": url, "events": events}
        if secret is not None:
            body["secret"] = secret
        return self._client._request("POST", "/api/webhooks", json=body)

    def update(
        self,
        webhook_id: str,
        *,
        url: Optional[str] = None,
        events: Optional[List[str]] = None,
        secret: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> Webhook:
        """Update an existing webhook.

        Args:
            webhook_id: The webhook's unique identifier.
            url: New endpoint URL.
            events: New list of subscribed events.
            secret: New shared secret.
            active: Enable or disable the webhook.

        Returns:
            The updated webhook object.

        Raises:
            NotFoundError: If the webhook does not exist.

        Example::

            # Disable a webhook
            bp.webhooks.update("wh_abc123", active=False)

            # Change events
            bp.webhooks.update("wh_abc123", events=["post.published"])
        """
        body: Dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if events is not None:
            body["events"] = events
        if secret is not None:
            body["secret"] = secret
        if active is not None:
            body["active"] = active
        return self._client._request("PUT", f"/api/webhooks/{webhook_id}", json=body)

    def delete(self, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook subscription.

        Args:
            webhook_id: The webhook's unique identifier.

        Returns:
            Confirmation dict.

        Raises:
            NotFoundError: If the webhook does not exist.

        Example::

            bp.webhooks.delete("wh_abc123")
        """
        return self._client._request("DELETE", f"/api/webhooks/{webhook_id}")


class AsyncWebhooksResource:
    """Async version of :class:`WebhooksResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            webhooks = await bp.webhooks.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[Webhook]:
        """List webhooks — see :meth:`WebhooksResource.list`."""
        return await self._client._request("GET", "/api/webhooks")

    async def create(
        self,
        *,
        url: str,
        events: List[str],
        secret: Optional[str] = None,
    ) -> Webhook:
        """Create a webhook — see :meth:`WebhooksResource.create`."""
        body: Dict[str, Any] = {"url": url, "events": events}
        if secret is not None:
            body["secret"] = secret
        return await self._client._request("POST", "/api/webhooks", json=body)

    async def update(
        self,
        webhook_id: str,
        *,
        url: Optional[str] = None,
        events: Optional[List[str]] = None,
        secret: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> Webhook:
        """Update a webhook — see :meth:`WebhooksResource.update`."""
        body: Dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if events is not None:
            body["events"] = events
        if secret is not None:
            body["secret"] = secret
        if active is not None:
            body["active"] = active
        return await self._client._request("PUT", f"/api/webhooks/{webhook_id}", json=body)

    async def delete(self, webhook_id: str) -> Dict[str, Any]:
        """Delete a webhook — see :meth:`WebhooksResource.delete`."""
        return await self._client._request("DELETE", f"/api/webhooks/{webhook_id}")
