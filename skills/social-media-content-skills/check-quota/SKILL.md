---
name: check-quota
description: Check BulkPublish plan limits and current usage. Use when the user asks about their plan, limits, or remaining quota.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Quota Reference

## get_quota_usage

Takes no parameters. Returns current plan, limits, and usage.

## Response shape

```
plan          — "free", "ltd" (Lifetime, from an AppSumo license), "pro", or "business"
limits        — max values for each resource (-1 means unlimited)
usage         — current consumption for each resource
subscription  — status, currentPeriodEnd, cancelAtPeriodEnd
```

## Plan limits

Read the numbers from `get_quota_usage`; do not quote them from memory. Limits
change with the plan and from time to time, and the response always holds the
ones that apply to this workspace right now. `-1` means unlimited and `0` means
the resource is not available on that plan.

The plans are Free, Lifetime (`ltd`), Pro and Business. What the limits cover:
connected channels and accounts per network, posts per day and per month,
scheduled posts waiting and scheduled per day, media storage, API requests per
day and API keys, repeating schedules, labels, team members, and RSS feeds
(with whether a feed may publish on its own, which Free cannot).

## Notes

- Daily limits reset at midnight UTC
- Storage is cumulative — delete old media with `delete_media` to free space
- When the limits allow one account per network (Free and Lifetime), every channel is on a different network
- Upgrade at app.bulkpublish.com/settings/billing
