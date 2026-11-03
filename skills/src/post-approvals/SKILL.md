---
name: post-approvals
description: Submit BulkPublish posts for team approval, work through the approval queue as an approver, and fix and resubmit rejected posts. Use when the user mentions approval, review by a teammate, the approval queue, or a rejected post.
profiles: core, full
---

# BulkPublish — Team Approval

`approvalStatus` (`"none"` default | `"pending"` | `"approved"` | `"rejected"`)
is separate from `status`. A `pending` or `rejected` post never publishes, even
when it is scheduled and overdue. Posts also carry `approvedBy`, `approvedAt`,
`rejectionReason` and `publishWhenApproved`.

## Submitting

- `create_post` or `update_post` with `status: "scheduled"`, a `scheduledAt`
  and `requestApproval: true`. A `draft` ignores the flag.
- Members whose role cannot publish (contributors) get it **forced on**,
  whatever is sent. Read `approvalStatus` back and say "waiting for approval",
  never "scheduled", when it is `"pending"`.
- **Publish as soon as approved**: add `publishWhenApproved: true`. For "post it
  now once approved", use the current time as `scheduledAt`. Do not set it when
  the user picked a specific time: a post meant for Friday 9am should not go out
  on Monday because that is when it was approved.
- `publish_post` and `retry_post` answer **403** `APPROVAL_REQUIRED` for a role
  that cannot publish. Do not call them again; submit for approval instead.

## Reviewing the queue (owner, admin or approver)

1. `list_posts` with `approvalStatus: "pending"` and `order: "asc"`.
2. For each, `get_post` and show the text per platform, media, accounts and
   time. Ask: approve, reject (with a reason), or skip.
3. **Approve** with `approve_post`, passing `ifUnmodifiedSince` = the
   `updatedAt` you showed, so an edit made since is never approved unseen.
   - It publishes at its scheduled time, or at once if that passed less than 15
     minutes ago.
   - Later than that, `whenLate` decides: `"publish"` publishes now; `"hold"`
     approves it but returns it as a `draft` for the author to pick a new time.
     Left out, `publishWhenApproved` decides (`true` publishes, otherwise hold).
     If a late post has `publishWhenApproved: false`, ask the user which they
     want before approving.
   - Read the returned `status`: `"draft"` means it needs rescheduling, so do
     not say it went out.
4. **Reject** with `reject_post`, a `reason` (up to 2000 characters, shown to
   the author) and `ifUnmodifiedSince`. The post returns to the author as a
   draft with `approvalStatus: "rejected"`.
5. The author is notified in-app either way. Approving or rejecting sets
   `publishWhenApproved` to `false`. Publishing a pending or rejected post as an
   approver approves it.

Errors on both: **400** not awaiting approval (or a bad `whenLate` /
`ifUnmodifiedSince`), **403** role lacks approval rights, **404** not found,
**409** the post changed or is no longer pending — reload with `get_post`, show
it again, and review again.

## Resubmitting a rejected post

`list_posts` with `approvalStatus: "rejected"`; `get_post` shows the reviewer's
`rejectionReason`. Revise to address it, then `update_post` with the new text,
a future `scheduledAt`, `status: "scheduled"`, `requestApproval: true` and
`ifUnmodifiedSince`. That sends it back to the queue.
