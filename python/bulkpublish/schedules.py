"""
Schedules resource for the BulkPublish SDK.

Provides methods to create, list, update, and delete recurring publishing
schedules.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Schedule


class SchedulesResource:
    """Operations on recurring publishing schedules.

    Access via ``client.schedules``:

    Example::

        bp = BulkPublish("bp_key")
        schedules = bp.schedules.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[Schedule]:
        """List all recurring schedules.

        Returns:
            List of schedule objects.

        Example::

            schedules = bp.schedules.list()
            for s in schedules:
                print(f"{s['name']} — {s['cronExpression']} ({s['timezone']})")
        """
        return self._client._request("GET", "/api/schedules")

    def create(self, **fields: Any) -> Schedule:
        """Create a new recurring schedule.

        Args:
            **fields: Schedule fields.  Common keys include ``name``,
                ``channelIds``, ``cronExpression``, ``timezone``,
                ``content``, ``active``.

        Returns:
            The newly created schedule object.

        Example::

            schedule = bp.schedules.create(
                name="Daily motivation",
                cronExpression="0 9 * * *",
                timezone="America/New_York",
                channelIds=["ch_1"],
                content="Stay focused! #motivation",
                active=True,
            )
            print(schedule["id"])
        """
        return self._client._request("POST", "/api/schedules", json=fields)

    def update(self, schedule_id: str, **fields: Any) -> Schedule:
        """Update an existing recurring schedule.

        Args:
            schedule_id: The schedule's unique identifier.
            **fields: Fields to update (same keys as :meth:`create`).

        Returns:
            The updated schedule object.

        Raises:
            NotFoundError: If the schedule does not exist.

        Example::

            bp.schedules.update("sched_abc123", active=False)
        """
        return self._client._request(
            "PUT", f"/api/schedules/{schedule_id}", json=fields
        )

    def delete(self, schedule_id: str) -> Dict[str, Any]:
        """Delete a recurring schedule.

        Args:
            schedule_id: The schedule's unique identifier.

        Returns:
            Confirmation dict.

        Raises:
            NotFoundError: If the schedule does not exist.

        Example::

            bp.schedules.delete("sched_abc123")
        """
        return self._client._request("DELETE", f"/api/schedules/{schedule_id}")


class AsyncSchedulesResource:
    """Async version of :class:`SchedulesResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            schedules = await bp.schedules.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[Schedule]:
        """List schedules — see :meth:`SchedulesResource.list`."""
        return await self._client._request("GET", "/api/schedules")

    async def create(self, **fields: Any) -> Schedule:
        """Create a schedule — see :meth:`SchedulesResource.create`."""
        return await self._client._request("POST", "/api/schedules", json=fields)

    async def update(self, schedule_id: str, **fields: Any) -> Schedule:
        """Update a schedule — see :meth:`SchedulesResource.update`."""
        return await self._client._request(
            "PUT", f"/api/schedules/{schedule_id}", json=fields
        )

    async def delete(self, schedule_id: str) -> Dict[str, Any]:
        """Delete a schedule — see :meth:`SchedulesResource.delete`."""
        return await self._client._request("DELETE", f"/api/schedules/{schedule_id}")
