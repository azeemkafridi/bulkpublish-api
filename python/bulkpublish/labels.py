"""
Labels resource for the BulkPublish SDK.

Provides methods to create, list, update, and delete labels used for
organizing posts and media files.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Label


class LabelsResource:
    """Operations on labels (tags for organizing content).

    Access via ``client.labels``:

    Example::

        bp = BulkPublish("bp_key")
        labels = bp.labels.list()
        for label in labels:
            print(label["name"], label["color"])
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[Label]:
        """List all labels.

        Returns:
            List of label objects.

        Example::

            labels = bp.labels.list()
            for label in labels:
                print(f"{label['name']} ({label['color']})")
        """
        return self._client._request("GET", "/api/labels")

    def create(self, *, name: str, color: str) -> Label:
        """Create a new label.

        Args:
            name: Display name for the label.
            color: Hex color code (e.g. ``"#ff6b6b"``).

        Returns:
            The newly created label object.

        Raises:
            ValidationError: If name or color is invalid.
            ConflictError: If a label with the same name already exists.

        Example::

            label = bp.labels.create(name="Campaign Q2", color="#4ecdc4")
            print(label["id"])
        """
        return self._client._request(
            "POST", "/api/labels", json={"name": name, "color": color}
        )

    def update(
        self,
        label_id: str,
        *,
        name: Optional[str] = None,
        color: Optional[str] = None,
    ) -> Label:
        """Update an existing label.

        Args:
            label_id: The label's unique identifier.
            name: New display name.
            color: New hex color code.

        Returns:
            The updated label object.

        Raises:
            NotFoundError: If the label does not exist.

        Example::

            bp.labels.update("lbl_abc123", name="Campaign Q3", color="#ff6348")
        """
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if color is not None:
            body["color"] = color
        return self._client._request("PUT", f"/api/labels/{label_id}", json=body)

    def delete(self, label_id: str) -> Dict[str, Any]:
        """Delete a label.

        Removes the label from all posts and media it was assigned to.

        Args:
            label_id: The label's unique identifier.

        Returns:
            Confirmation dict.

        Raises:
            NotFoundError: If the label does not exist.

        Example::

            bp.labels.delete("lbl_abc123")
        """
        return self._client._request("DELETE", f"/api/labels/{label_id}")


class AsyncLabelsResource:
    """Async version of :class:`LabelsResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            labels = await bp.labels.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[Label]:
        """List all labels — see :meth:`LabelsResource.list`."""
        return await self._client._request("GET", "/api/labels")

    async def create(self, *, name: str, color: str) -> Label:
        """Create a label — see :meth:`LabelsResource.create`."""
        return await self._client._request(
            "POST", "/api/labels", json={"name": name, "color": color}
        )

    async def update(
        self,
        label_id: str,
        *,
        name: Optional[str] = None,
        color: Optional[str] = None,
    ) -> Label:
        """Update a label — see :meth:`LabelsResource.update`."""
        body: Dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if color is not None:
            body["color"] = color
        return await self._client._request("PUT", f"/api/labels/{label_id}", json=body)

    async def delete(self, label_id: str) -> Dict[str, Any]:
        """Delete a label — see :meth:`LabelsResource.delete`."""
        return await self._client._request("DELETE", f"/api/labels/{label_id}")
