"""Calendar notes: free text pinned to a calendar day. They never publish anywhere."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import CalendarNote


class CalendarNotesResource:
    """Operations on calendar notes (``client.calendar_notes``)."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self, *, from_date: str, to_date: str) -> List[CalendarNote]:
        """Notes dated within ``from_date``..``to_date`` (YYYY-MM-DD, inclusive, at most a year)."""
        return self._client._request("GET", "/api/calendar-notes", params={"from": from_date, "to": to_date})["notes"]

    def create(self, *, date: str, body: str, color: Optional[str] = None) -> CalendarNote:
        payload: Dict[str, Any] = {"date": date, "body": body}
        if color is not None:
            payload["color"] = color
        return self._client._request("POST", "/api/calendar-notes", json=payload)["note"]

    def update(self, note_id: int, *, date: Optional[str] = None, body: Optional[str] = None, color: Optional[str] = None) -> CalendarNote:
        payload: Dict[str, Any] = {}
        if date is not None:
            payload["date"] = date
        if body is not None:
            payload["body"] = body
        if color is not None:
            payload["color"] = color
        return self._client._request("PUT", f"/api/calendar-notes/{note_id}", json=payload)["note"]

    def delete(self, note_id: int) -> Dict[str, Any]:
        return self._client._request("DELETE", f"/api/calendar-notes/{note_id}")


class AsyncCalendarNotesResource:
    """Async variant of :class:`CalendarNotesResource`."""

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self, *, from_date: str, to_date: str) -> List[CalendarNote]:
        return (await self._client._request("GET", "/api/calendar-notes", params={"from": from_date, "to": to_date}))["notes"]

    async def create(self, *, date: str, body: str, color: Optional[str] = None) -> CalendarNote:
        payload: Dict[str, Any] = {"date": date, "body": body}
        if color is not None:
            payload["color"] = color
        return (await self._client._request("POST", "/api/calendar-notes", json=payload))["note"]

    async def update(self, note_id: int, *, date: Optional[str] = None, body: Optional[str] = None, color: Optional[str] = None) -> CalendarNote:
        payload: Dict[str, Any] = {}
        if date is not None:
            payload["date"] = date
        if body is not None:
            payload["body"] = body
        if color is not None:
            payload["color"] = color
        return (await self._client._request("PUT", f"/api/calendar-notes/{note_id}", json=payload))["note"]

    async def delete(self, note_id: int) -> Dict[str, Any]:
        return await self._client._request("DELETE", f"/api/calendar-notes/{note_id}")
