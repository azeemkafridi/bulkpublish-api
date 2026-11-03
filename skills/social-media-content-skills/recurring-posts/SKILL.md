---
name: recurring-posts
description: Set up and manage BulkPublish posts that repeat on a schedule, daily, weekly, every two weeks or monthly, and pause, change or stop them. Use when the user wants evergreen content, a weekly series or any post that repeats.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Recurring Posts

Two ways to repeat, both shown on the Repeat Posts page of the app:

| Way | Use when |
|---|---|
| `create_post` with `repeatSchedule` | One post the user has written should go out again and again |
| `create_schedule` | A rule that creates a new post from a template on every run |

Work in the user's timezone (an IANA name such as `America/New_York`), and read
the cadence back in plain words ("every Monday and Thursday at 09:00 New York
time") before creating anything.

## create_post with repeatSchedule

`repeatSchedule` = `{frequency, daysOfWeek, dayOfMonth, timeOfDay, timezone}`:
`frequency` is `daily`, `weekly`, `biweekly` or `monthly`; `daysOfWeek` (0 =
Sunday … 6 = Saturday) for weekly and biweekly; `dayOfMonth` for monthly;
`timeOfDay` as `"HH:MM"`. Send it with `status: "scheduled"` and the first
`scheduledAt`.

## create_schedule

`name`, `channelIds`, `frequency` (`daily`, `weekly`, `biweekly`, `monthly`),
`timeOfDay` (`"HH:MM"`, 24h), `dayOfWeek` (0 = Sunday … 6 = Saturday) for
weekly and biweekly, `dayOfMonth` (1-31) for monthly, `contentTemplate`,
`mediaFileIds` (reused on every run), `timezone` (default UTC), `isActive`
(default true), and `requireApproval` to hold every generated post for a
teammate (forced on for a member who cannot publish).

Call `list_schedules` first to avoid duplicates. A post exists only once a run
fires; it carries `recurringScheduleId`.

## Managing schedules

- `list_schedules` (newest first, up to 500): name, timing, accounts, active or
  paused, and `nextRunAt`.
- Pause or resume with `update_schedule` `isActive`; change timing, text, media
  or approval with `update_schedule` (the next run is recomputed).
- `delete_schedule` stops it for good; posts it already made stay.
- `list_posts` with `recurring` lists the posts schedules made.

Media on a repeating post is always kept in the library, even when
`deleteMediaAfterPublish` is set.
