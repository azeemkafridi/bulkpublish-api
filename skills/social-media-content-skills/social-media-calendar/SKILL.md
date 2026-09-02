---
name: social-media-calendar
description: Plan, organize, and schedule a cross-platform social media calendar through BulkPublish. Use when the user wants a posting schedule, queue, or recurring cadence.
---

# Social Media Calendar

Create a calendar that is realistic for the audience, campaign, connected channels, and BulkPublish limits.

## Workflow

- Establish the date range, timezone, cadence, campaign constraints, target platforms, and approval requirements.
- Spread topics and formats across the calendar to avoid repetition and platform over-posting.
- Use `get_queue_slot` when the user wants the next optimal available slot; do not claim an optimal time without checking it.
- Check channels and quota before creating a large schedule.
- Use ISO 8601 timestamps and the user's stated timezone.
- Create drafts unless the user explicitly asks to schedule or publish. When approval is requested, set `requestApproval: true` and report the returned approval state.

Before execution, validate each post with `platform-reference` and `media-preflight`. Summarize the resulting calendar with post IDs, status, times, timezone, and any posts awaiting approval.
