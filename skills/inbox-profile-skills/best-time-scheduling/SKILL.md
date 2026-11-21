---
name: best-time-scheduling
description: Find the weekdays and hours when the user's BulkPublish posts get the most engagement, and schedule or move posts into those times, falling back to the queue when there is not enough history. Use when the user asks when to post, the best time to post, or wants posts scheduled at good times.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# Best-Time Scheduling

## Tools

| Tool | Use for |
|---|---|
| `get_best_times` | Average engagements and impressions by weekday and hour over a window of at most 30 days, and up to 5 best slots |
| `get_queue_slot` | The next free slot in the workspace's posting schedule, when there is not enough history |
| `create_post` | A new post, as a draft or scheduled at a time |
| `update_post` | Move one existing post to a new time |
| `list_posts` | What is already scheduled, so new posts do not pile into one hour |
| `bulk_posts` | Move many posts to ONE time (see the warning below) |

## Reading `get_best_times`

Pass `from`, `to` and the user's `tz` (for example `"Europe/Berlin"`); weekdays
and hours come back in that timezone. Narrow it with `channelIds`, `platforms`,
`labelIds`, `postFormat` or `mediaType` when the user asks about one account or
one kind of post.

- `best` lists up to 5 slots, best first. A slot is only recommended once it
  holds at least 3 posts (`minPosts`).
- `enoughData: false` means no slot has 3 posts yet. Say so plainly and use the
  queue instead. Never name a "best time" from one or two posts.
- `slots` is every weekday-and-hour that had a post. A busy hour with a low
  average is worth mentioning; an hour with no posts is unknown, not bad.
- `excludedPosts` counts posts left out because their network does not report
  engagement or they were not measured yet. If it is large compared with
  `postCount`, warn that the answer rests on part of the account.

The result describes when the user's own posts did well in the past. It is a
habit of their audience, not a guarantee, and it says nothing about hours they
never posted in.

## Recipe: "when should I post?"

1. `get_best_times` for the last 30 days in the user's timezone.
2. If `enoughData` is true, give the top 3 slots as "Wednesday around 14:00
   (3 posts, about 80 engagements each)". If the user posts to several
   accounts, offer to run it per account with `channelIds`, because audiences
   differ.
3. If `enoughData` is false, say how many posts were counted and suggest
   posting at varied times for a few weeks; meanwhile `get_queue_slot` gives
   the next free slot.

## Recipe: schedule new posts at the best times

1. Run the recipe above and agree the slots with the user.
2. `list_posts` with `status: "scheduled"` for the coming week, so you do not
   put two posts to the same account in the same hour.
3. Work out the next date for each slot in the user's timezone, and pass
   `scheduledAt` as an ISO 8601 time with the offset, or in UTC. It must be in
   the future: a scheduled post whose time has already passed publishes at
   once.
4. Show the user every post with its accounts and time. Only after a yes, call
   `create_post` with `status: "scheduled"` and that `scheduledAt`. Without a
   yes, create drafts instead.
5. If the connection belongs to someone whose role cannot publish, scheduled
   posts go to the approval queue rather than straight onto the schedule. Tell
   the user an approver has to release them. Anyone can send a post through
   the same review on purpose with `requestApproval: true`.

## Moving posts that already exist

- One post, or posts that each need their own time: `update_post` with the new
  `scheduledAt`, one post per call. A scheduled post stays scheduled; a draft
  only gets the time stored and stays a draft unless you also send
  `status: "scheduled"`, which needs the user's yes.
- `bulk_posts` with `action: "reschedule"` puts EVERY post in the list at the
  SAME `scheduledAt`. It is for "move all of these to Monday 9:00", not for
  spreading posts over the best slots. It also turns any draft in the list into
  a scheduled post that will publish at that time, so only include drafts the
  user has agreed to publish, and confirm the list before calling it.
