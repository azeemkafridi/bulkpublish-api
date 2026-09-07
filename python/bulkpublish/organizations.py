"""
Organizations resource for the BulkPublish SDK.

Lists the organizations the authenticated user belongs to, and creates new
ones. An API key is bound to a single organization, so every other resource
acts on that one; this is how you find out which organizations exist and what
role you hold in each.

Switching between organizations and leaving one are session actions rather than
API ones, and are deliberately absent: a key has no "current" organization to
change.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, List

if TYPE_CHECKING:
    from .client import _BaseClient

from .types import Organization


class OrganizationsResource:
    """Operations on organizations.

    Access via ``client.organizations``:

    Example::

        bp = BulkPublish("bp_key")
        for org in bp.organizations.list():
            print(org["name"], org["role"])
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    def list(self) -> List[Organization]:
        """List every organization the user is a member of.

        Where the user owns several, the ``plan`` reported is the highest of
        them: owned organizations share a plan, and this is the figure the app
        enforces against.

        Returns:
            List of organization objects, each carrying the caller's ``role``.

        Example::

            owned = [o for o in bp.organizations.list() if o["role"] == "owner"]
        """
        return self._client._request("GET", "/api/organizations")

    def create(self, *, name: str) -> Organization:
        """Create a new organization, owned by the caller.

        Args:
            name: Display name. 100 characters or fewer.

        Returns:
            The newly created organization.

        Raises:
            ValidationError: If the name is missing or too long.

        Example::

            org = bp.organizations.create(name="Northwind Social")
        """
        return self._client._request(
            "POST", "/api/organizations", json={"name": name}
        )


class AsyncOrganizationsResource:
    """Async version of :class:`OrganizationsResource`.

    Every method is an ``async`` coroutine with the same signature and
    behaviour as its synchronous counterpart.

    Example::

        async with AsyncBulkPublish("bp_key") as bp:
            orgs = await bp.organizations.list()
    """

    def __init__(self, client: _BaseClient) -> None:
        self._client = client

    async def list(self) -> List[Organization]:
        """List organizations — see :meth:`OrganizationsResource.list`."""
        return await self._client._request("GET", "/api/organizations")

    async def create(self, *, name: str) -> Organization:
        """Create an organization — see :meth:`OrganizationsResource.create`."""
        return await self._client._request(
            "POST", "/api/organizations", json={"name": name}
        )
