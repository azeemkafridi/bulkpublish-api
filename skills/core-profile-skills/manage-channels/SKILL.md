---
name: manage-channels
description: List connected social media channels, check what the caller may do with them, and look up platform options such as boards and playlists in BulkPublish. Use when the user asks about their connected accounts.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Connected Channels

## Tools

| Tool | Use for | Key params |
|---|---|---|
| `list_channels` | Connected accounts with IDs, status and the caller's capabilities | `active` (default true) |
| `view_channels` | The same list as an interactive view | none |
| `get_channel_options` | Destinations inside an account (see below) | `channelId`, plus `boardId` or `q` |
| `update_channel` | X sync switches (`metricsSyncEnabled`, `inboxSyncEnabled`) | `channelId` |

Prefer `view_channels` when the user wants to look at their accounts, and
`list_channels` when you need the IDs to build a post. Use the channel ID in
`create_post`, never the account name.

## What list_channels returns

Each channel: `id`, `platform`, `accountName`, `accountId`, `accountType`,
`isActive`, `tokenStatus` (`"valid"`, `"expiring_soon"` or `"expired"`),
`tokenExpiresAt`.

The response also carries a `capabilities` object saying whether this caller may
create, publish or approve posts. Check it before attempting a write, rather
than discovering the limit from a 403.

Platform keys: `facebook`, `instagram`, `x`, `linkedin`, `tiktok`, `youtube`,
`pinterest`, `threads`, `bluesky`, `gmb`, `mastodon`, `discord`, `telegram`,
`tumblr`, `snapchat`.

## get_channel_options

| Platform | Returns |
|---|---|
| Pinterest | Boards; with `boardId`, that board's sections |
| YouTube | Playlists |
| Tumblr | Blogs |
| Discord | Text channels in the connected server |
| Threads | Places matching `q`, for `locationId` |

## Reconnecting

A channel can be connected but no longer usable, because the account's
authorization expired or was revoked on the platform's side (`tokenStatus:
"expired"`). A publish to one fails, so surface it before scheduling: tell the
user which account needs reconnecting and that it is done in BulkPublish under
Channels. Accounts are connected and reconnected only there, never from here.

## X sync switches

On X every read is billed, so both switches are off until turned on.
`metricsSyncEnabled` turns on analytics (at most once every 7 days);
`inboxSyncEnabled` turns on direct messages and replies. On any other platform
`update_channel` succeeds and changes nothing. It needs the owner, admin or
approver role.

## LinkedIn

A LinkedIn channel is either a personal profile or a company page
(`accountType`: `personal` / `organization`). Both are posted to the same way,
but they are gated separately, so one can be unavailable while the other works.
When that is what blocks a write, the 403 `PLATFORM_DISABLED` error names the
`accountType`.

## Notes

- `active: false` includes channels the user has switched off.
- If the user has no channels, say so plainly and point them to connecting one
  in BulkPublish; do not invent channel IDs.
