---
name: manage-scheduled-posts
description: Edit, reschedule, unschedule or delete BulkPublish posts, and add or remove the accounts a post goes to, without overwriting a teammate's changes. Use when the user wants to change a post that already exists.
profiles: core, full
---

# BulkPublish — Changing Existing Posts

Always `get_post` first, show the user the change, and wait for a yes. Pass
`ifUnmodifiedSince` = the `updatedAt` you read on every `update_post`: if a
teammate changed the post since, the call is refused with **409** instead of
overwriting their version. On a 409, reload, show the user what is there now,
and ask again.

## What can be edited

Only `draft`, `scheduled`, `failed` and `partial` posts. Editing a failed post
returns it to `draft`; a partial post stays partial.

## Replace, not merge

These fields replace the stored value as a whole, so send everything to keep:

| Field | Note |
|---|---|
| `platformContent` | Every platform's text you want to keep |
| `mediaFileIds` | The full list, in order |
| `labelIds` | The full list |
| `channels` | The COMPLETE list of accounts the post should keep (below) |

## Changing accounts

Send `channels` with every account the post should go to after the edit, not a
difference. Accounts left out are dropped, new ones are added as pending, and
kept ones keep their state. An account the post has already gone out on cannot
be removed. Check the media rules for any platform you add.

## Rescheduling

- `update_post` with `scheduledAt`, `timezone` and `status: "scheduled"`. The
  time must be in the future: `update_post` refuses a past one with
  `VALIDATION_ERROR` (unlike `create_post`, where a past time publishes at once).
- Top of the queue: `get_queue_slot` with `position: "next"` and
  `excludePostId` set to this post. Bottom: `position: "end"`.
- Rescheduling a post that waits for approval clears its `publishWhenApproved`
  unless you send it again.
<<<full:
- Many posts at once: `bulk_posts` with `action: "reschedule"` and
  `scheduledAt`, up to 100 IDs. It counts against the same daily and pending
  limits as creating posts (403 `QUOTA_EXCEEDED` changes nothing).
>>>

## Unscheduling

`update_post` with `status: "draft"`. Nothing is deleted, and it can be
scheduled again later.

## Deleting

`delete_post` is permanent. It takes any post except one that is publishing
right now (**409** `PUBLISH_IN_PROGRESS`; wait for it to finish). It removes the
post from BulkPublish only: a published post stays live on the platforms, and
its stats here go with it. Deleting a post made by a repeat schedule
(`recurringScheduleId` set) also switches that schedule off; to skip one
occurrence, unschedule it instead. List what will be deleted (ID and first
line) and get an explicit yes. <<<full: For many, `bulk_posts` with `action: "delete"` (up to 100 IDs).>>>

## Publishing now

`publish_post` sends a draft or scheduled post immediately. A role that cannot
publish gets **403** `APPROVAL_REQUIRED`: submit it for approval instead.
