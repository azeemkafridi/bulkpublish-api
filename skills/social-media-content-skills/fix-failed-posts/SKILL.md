---
name: fix-failed-posts
description: Find BulkPublish posts that failed or only partly published, explain why, and retry the right ones without posting anything twice. Use when the user asks why a post did not go out, about failed or partial posts, or wants to retry.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Fixing Failed Posts

A post's `status` is `failed` when no destination published and `partial` when
some did. Each destination in `get_post` has its own status and error message.

## Workflow

1. `list_posts` with `status: "failed"`, then `status: "partial"`. For each,
   `get_post` and read every destination's status and error.
2. Sort the causes before doing anything:
   - **Disconnected account** — `list_channels` shows `tokenStatus: "expired"`.
     The user reconnects it in BulkPublish under Channels; nothing else helps.
   - **Media the platform refused** — wrong type, length or count for that
     post type (see the platform-reference skill).
   - **Text over the limit** for that platform.
   - **A temporary platform error** — usually fine to retry as is.
   - **`APPROVAL_REQUIRED`** — the role cannot publish; submit it for approval
     instead (post-approvals skill).
3. Fix content with `update_post` (send `ifUnmodifiedSince` = the `updatedAt`
   you read). Editing a failed post returns it to `draft`, so schedule it again
   afterwards; a partial post stays partial, and scheduling it re-sends only the
   destinations that failed.
4. `retry_post` re-sends only the destinations that failed, never the ones that
   published.
5. Many posts with a temporary error: `bulk_posts` with `action: "retry"`, up
   to 100 IDs per call.

## Unconfirmed destinations

A destination in status `unconfirmed` may already be live: the request reached
the platform but its answer was lost. It is never retried on its own. If a post
has unconfirmed destinations and no failed ones, `retry_post` answers **400**
`UNCONFIRMED_REQUIRES_REPUBLISH`.

Ask the user to look at the account on the platform. Only when they confirm the
post is NOT there, call `retry_post` with `republish: true`. Passing it any
earlier can publish the post twice.

## Rules

- Show the user the plan (which posts, what changes, what is retried) and get a
  yes before retrying or editing anything.
- Report what actually happened from the response, per destination; do not
  say a post "went out" until its destination shows it.
- `delete_post` removes a post from BulkPublish only. A published destination
  stays live on its platform, so deleting is never a way to take one down.
