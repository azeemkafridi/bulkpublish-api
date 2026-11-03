---
name: recurring-posts
description: Set up and manage BulkPublish posts that repeat on a schedule, daily, weekly, every two weeks or monthly, and pause, change or stop them. Use when the user wants evergreen content, a weekly series or any post that repeats.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Recurring Posts

A repeating post is a `create_post` with `repeatSchedule`. It shows on the
Repeat Posts page of the app, which is also where it is paused, changed or
stopped.

Work in the user's timezone (an IANA name such as `America/New_York`), and read
the cadence back in plain words ("every Monday and Thursday at 09:00 New York
time") before creating anything.

## create_post with repeatSchedule

`repeatSchedule` = `{frequency, daysOfWeek, dayOfMonth, timeOfDay, timezone}`:
`frequency` is `daily`, `weekly`, `biweekly` or `monthly`; `daysOfWeek` (0 =
Sunday … 6 = Saturday) for weekly and biweekly; `dayOfMonth` for monthly;
`timeOfDay` as `"HH:MM"`. Send it with `status: "scheduled"` and the first
`scheduledAt`.

Media on a repeating post is always kept in the library, even when
`deleteMediaAfterPublish` is set.
