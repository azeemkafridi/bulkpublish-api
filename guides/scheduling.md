# Scheduling

BulkPublish supports three ways to time your posts: immediate publishing, one-time scheduling, and recurring schedules.

## Creating a Scheduled Post

Set `status` to `"scheduled"` and provide a `scheduledAt` timestamp in ISO 8601 format:

```bash
curl -X POST https://app.bulkpublish.com/api/posts \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Coming soon!",
    "channels": [{"channelId": 1, "platform": "x"}],
    "status": "scheduled",
    "scheduledAt": "2026-04-10T14:00:00Z",
    "timezone": "America/New_York"
  }'
```

**Python**

```python
post = client.posts.create(
    content="Coming soon!",
    channels=[{"channelId": 1, "platform": "x"}],
    status="scheduled",
    scheduledAt="2026-04-10T14:00:00Z",
    timezone="America/New_York",
)
```

**Node.js**

```javascript
const post = await client.posts.create({
  content: "Coming soon!",
  channels: [{ channelId: 1, platform: "x" }],
  status: "scheduled",
  scheduledAt: "2026-04-10T14:00:00Z",
  timezone: "America/New_York",
});
```

### Key Points

- `scheduledAt` must be a valid ISO 8601 datetime string (e.g., `2026-04-10T14:00:00Z`)
- `timezone` is optional and defaults to `"UTC"`. Use IANA timezone names like `"America/New_York"`, `"Europe/London"`, `"Asia/Tokyo"`
- If `scheduledAt` is in the past or is the current time, the post is queued for immediate publishing
- Scheduled posts enter the `"scheduled"` status and transition to `"publishing"` when the scheduler picks them up

### Scheduling Without a Specific Time

If you set `status` to `"draft"`, the post is saved but not queued. You can publish it later by calling:

```bash
curl -X POST https://app.bulkpublish.com/api/posts/POST_ID/publish \
  -H "Authorization: Bearer bp_your_key_here"
```

## Queue Slots

Queue slots help you find optimal posting times. Request an available slot for a specific channel:

```bash
curl "https://app.bulkpublish.com/api/posts/queue-slot?channelId=1" \
  -H "Authorization: Bearer bp_your_key_here"
```

The response suggests a time when the channel has no other posts scheduled, helping you avoid overlap and maximize reach.

## Recurring Schedules

Recurring schedules automatically create and publish posts on a repeating basis. This is useful for evergreen content, regular updates, or social media calendars.

### Frequencies

| Frequency | Description |
|-----------|-------------|
| `daily` | Every day at the specified time |
| `weekly` | Every week on a specific day |
| `biweekly` | Every two weeks on a specific day |
| `monthly` | On a specific day of the month |

### Creating a Recurring Schedule

**Standalone schedule (POST /api/schedules)**

```bash
curl -X POST https://app.bulkpublish.com/api/schedules \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly product update",
    "frequency": "weekly",
    "dayOfWeek": 1,
    "timeOfDay": "10:00",
    "timezone": "America/New_York",
    "channelIds": [1, 2, 3],
    "contentTemplate": "Here is our weekly product update!"
  }'
```

**Inline with a post (POST /api/posts)**

You can attach a recurring schedule when creating a post by including `repeatSchedule`:

```json
{
  "content": "Weekly tip: use keyboard shortcuts!",
  "channels": [{"channelId": 1, "platform": "x"}],
  "status": "scheduled",
  "scheduledAt": "2026-04-10T10:00:00Z",
  "repeatSchedule": {
    "frequency": "weekly",
    "daysOfWeek": [1],
    "timeOfDay": "10:00",
    "timezone": "America/New_York"
  }
}
```

### Schedule Parameters

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Human-readable name for the schedule |
| `frequency` | string | `daily`, `weekly`, `biweekly`, or `monthly` |
| `dayOfWeek` | number | Day of week (0 = Sunday, 6 = Saturday). Required for `weekly` and `biweekly` |
| `dayOfMonth` | number | Day of month (1-31). Required for `monthly` |
| `timeOfDay` | string | Time in `HH:MM` 24-hour format (e.g., `"14:30"`) |
| `timezone` | string | IANA timezone name (defaults to `"UTC"`) |
| `channelIds` | number[] | Channel IDs to publish to |
| `contentTemplate` | string | Post content |
| `mediaFileIds` | number[] | Optional media to attach |
| `isActive` | boolean | Whether the schedule is active (default: `true`) |

### Managing Schedules

**List schedules**

```bash
curl https://app.bulkpublish.com/api/schedules \
  -H "Authorization: Bearer bp_your_key_here"
```

**Update a schedule**

```bash
curl -X PUT https://app.bulkpublish.com/api/schedules/SCHEDULE_ID \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"isActive": false}'
```

**Delete a schedule**

```bash
curl -X DELETE https://app.bulkpublish.com/api/schedules/SCHEDULE_ID \
  -H "Authorization: Bearer bp_your_key_here"
```

### Recurring Schedule Limits

| Plan | Recurring Schedules |
|------|-------------------|
| Free | Not available |
| Pro | 10 |
| Business | Unlimited |

## Timezone Handling

- All timestamps stored internally are in UTC
- The `timezone` field is used for display and for calculating recurring schedule run times
- When `scheduledAt` includes a timezone offset (e.g., `2026-04-10T14:00:00-04:00`), it is correctly interpreted regardless of the `timezone` field
- When `scheduledAt` ends in `Z`, it is treated as UTC
- The `timezone` field affects recurring schedule calculations -- "every day at 10:00 America/New_York" correctly adjusts for DST changes

### Common Timezone Examples

| Timezone | UTC Offset |
|----------|-----------|
| `America/New_York` | UTC-5 / UTC-4 (DST) |
| `America/Los_Angeles` | UTC-8 / UTC-7 (DST) |
| `Europe/London` | UTC+0 / UTC+1 (BST) |
| `Europe/Berlin` | UTC+1 / UTC+2 (CEST) |
| `Asia/Tokyo` | UTC+9 |
| `Australia/Sydney` | UTC+10 / UTC+11 (AEDT) |
| `UTC` | UTC+0 |
