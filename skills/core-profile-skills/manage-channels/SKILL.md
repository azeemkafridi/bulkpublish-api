---
name: manage-channels
description: List connected social media channels and check what the caller may do with them in BulkPublish. Use when the user asks about their connected accounts.
---

# BulkPublish — Connected Channels

## Tools

| Tool | Use for | Key params |
|---|---|---|
| `list_channels` | Connected accounts as data | `active` (default true) |
| `view_channels` | The same list as an interactive view | none |

Prefer `view_channels` when the user wants to look at their accounts, and
`list_channels` when you need the IDs to build a post.

## What comes back

Each channel carries its ID, platform, account name and connection status. Use
the channel ID in `create_post` — never the account name.

The response also carries a `capabilities` object saying whether this caller may
create, publish or approve posts. Check it before attempting a write, rather
than discovering the limit from a 403.

## Reconnecting

A channel can be connected but no longer usable, because the account's
authorization expired or was revoked on the platform's side. Those channels are
flagged in the response. A publish to one will fail, so surface it before
scheduling: tell the user which account needs reconnecting and that it is done
in BulkPublish under Channels. You cannot reconnect an account from here.

## LinkedIn

A LinkedIn channel is either a personal profile or a company page
(`accountType`: `personal` / `organization`). Both are posted to the same way,
but they are gated separately — one can be unavailable while the other works.
When that is what blocks a write, the 403 `PLATFORM_DISABLED` error names the
`accountType`.

## Notes

- `active: false` includes channels the user has switched off.
- If the user has no channels, say so plainly and point them to connecting one
  in BulkPublish; do not invent channel IDs.
