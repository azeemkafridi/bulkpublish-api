---
name: next-week-plan
description: Plan and prepare next week's BulkPublish posts from what worked over the last 30 days, schedule them at the account's best times, and leave everything as drafts or approval requests until the user says go. Use when the user asks an assistant to run their social media for the week, plan next week, or "do what worked again".
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# Next Week's Plan

The full loop an assistant can run on its own: look back, decide, draft,
schedule. Every step that reaches the public waits for the user. Read
`performance-review` and `best-time-scheduling` for the details of steps 1
and 4.

## Before you start

`list_channels` gives the channel IDs and a `capabilities` object. If
`canCreatePosts` is false the connection is read-only: do the review and the
plan, and hand the drafts over as text. If `canPublishPosts` is false,
everything you schedule goes to the approval queue; say so up front.

Agree three things with the user: which accounts, how many posts per account,
and their timezone.

## 1. Look back (last 30 days)

1. `get_engagement_analytics` with `vsMedian: true` for the agreed accounts.
2. Note the standouts and underperformers against each account's own usual,
   and what the standouts share: labels, media type, threads or single posts,
   topics in the text.
3. `get_link_analytics` if the posts carry links, for what people clicked.
4. Summarise in at most five lines, with post counts behind each point. If
   there are fewer than about 10 measured posts, say the plan rests on little
   history.

## 2. Check what is already planned

- `list_posts` with `status: "scheduled"` for next week, so you do not double
  up.
- `list_posts` with `status: "draft"`, in case the user already has material.
- `list_schedules` for repeat posts that will go out anyway.

## 3. Draft

Write the posts: more of what stood out, less of what underperformed, and say
which finding each post follows. Adapt the text per network (see
`platform-reference`). If a post needs an image or video the user has not
given you, say what it needs instead of inventing one.

Show the whole plan as one list: text, accounts, proposed time, and the finding
behind it. Change it until the user is happy.

## 4. Pick times

`get_best_times` for the same window and timezone. Spread the posts over the
`best` slots, at most one post per account per slot, and skip hours already
taken in step 2. If `enoughData` is false, use `get_queue_slot` for each post.

## 5. Save

Only now write anything:

- Default: `create_post` as drafts, labelled so the batch is easy to find
  (`list_labels`, or `create_label` with `type: "post"`). Tell the user where
  to find them.
- If the user said to schedule: `create_post` with `status: "scheduled"` and
  a future `scheduledAt`, after showing the final list once more.
- A post the user wants every week: offer a repeat schedule with
  `create_schedule` (frequency, day, time and timezone) instead of copying it
  by hand.

Never call `publish_post` in this flow: next week's posts go out at their
times.

## 6. Report

List what you created with post IDs, times in the user's timezone, which
accounts, and which ones wait for approval. Offer to review the results the
same way next week.
