---
name: schedule-post
description: Create, schedule, or publish social media posts via BulkPublish MCP. Use when the user wants to post to social media.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Post Creation Reference

## create_post parameters

```
content        (string, optional) — post text; may be omitted for a media-only post
channels       (array, required)  — [{channelId: number, platform: string}]
                                    Get these from list_channels first
status         ("draft"|"scheduled") — default "draft"
scheduledAt    (ISO 8601 string)  — required when status is "scheduled"
timezone       (string)           — IANA name, e.g. "America/New_York", "Asia/Karachi"
mediaFileIds   (number[])         — IDs from upload_media
platformContent (object)          — per-platform text: {"x": "Short", "linkedin": "Longer version"}
postTypeOverrides (object)        — per-platform format: {"instagram": "reel", "facebook": "story"}
postFormat     ("post"|"video"|"reel"|"story"|"carousel"|"thread") — "thread" requires threadParts
threadParts    (array)            — [{content: string, mediaFileIds?: number[]}], min 2 parts.
                                    EVERY part is length-checked against every target platform,
                                    not just the first — an over-long part 400s the whole request
platformSpecific (object)         — per-platform options; see the
                                    platform-reference skill. Auto-reply after
                                    publishing goes here as the top-level key
                                    "_firstComment", NOT a firstComment param:
                                    {"_firstComment": "Link in bio!"}
                                    Unsupported on discord, pinterest, tiktok,
                                    gmb, tumblr and snapchat (recorded as failed; the main
                                    post still publishes)
requestApproval (boolean)         — default false; hold a scheduled post for team
                                    approval (approvalStatus becomes "pending")
publishWhenApproved (boolean)     — default false; with requestApproval, publish
                                    the post as soon as it is approved even if
                                    that is after its scheduled time
linkTrackingOverride (boolean|null) — default null; per-post override for
                                    bulkpubli.sh link tracking. true shortens the
                                    post's links and counts clicks, false posts
                                    them as written, null inherits the org setting.
                                    Pro and Business only: on Free, links always
                                    publish as written
```

`linkTrackingOverride` is tri-state, so **omit it unless the user actually asked
for one behaviour or the other** — sending `false` is an explicit "post the links
as written" and is not the same as leaving it unset. Shortening happens at
publish time, per channel, and is **skipped** for any channel where the rewrite
would push the post past that platform's character limit: a short URL is 28
characters and can be longer than the link it replaces, so on X (280) or Bluesky
(300) tracking may silently not apply. The post still publishes, with its
original links.

## Post types

Every value `postTypeOverrides` accepts, per platform. The first is the one used
when you set none.

| Platform | Key | `postTypeOverrides` values |
|---|---|---|
| Instagram | `instagram` | `feed_photo`, `feed_video`, `reel`, `story`, `carousel` |
| Facebook | `facebook` | `post`, `video`, `reel`, `story`, `carousel` |
| X | `x` | `tweet`, `video`, `thread`, `repost` |
| TikTok | `tiktok` | `video`, `photo_slideshow` |
| YouTube | `youtube` | `video`, `short` |
| Threads | `threads` | `text`, `image`, `video`, `carousel`, `repost` |
| Bluesky | `bluesky` | `post`, `video`, `thread`, `repost` |
| LinkedIn | `linkedin` | `post`, `multi_image`, `pdf_carousel`, `article`, `document`, `poll`, `reshare` |
| Pinterest | `pinterest` | `pin`, `video_pin`, `carousel` |
| Google Business | `gmb` | `standard`, `event`, `offer` |
| Mastodon | `mastodon` | `post`, `thread`, `repost` |
| Discord | `discord` | `post` |
| Telegram | `telegram` | `post` |
| Tumblr | `tumblr` | `post` |
| Snapchat | `snapchat` | `story`, `saved_story`, `spotlight` |

Media rules the server enforces: YouTube needs a video. TikTok needs a video, or 1 to 35 images with postTypeOverrides.tiktok 'photo_slideshow' (images only, no video); neither goes on a text-only post. Instagram defaults to a feed photo, so a video needs postTypeOverrides.instagram 'reel' or 'feed_video', and a carousel needs at least 2 files. A Pinterest carousel takes 2 to 5 images. Every Snapchat post needs exactly one image or video. Video lengths are checked when the post is scheduled or published: Instagram reel/feed_video 3s to 15min, story 3s to 60s; Facebook reel 3s to 90s, story 3s to 60s; Threads video up to 5min; LinkedIn 3s to 30min; Pinterest video pin at least 4s; Snapchat story 5s to 60s, spotlight 6s to 60s.

## Team approval

`approvalStatus` (`"none"` default | `"pending"` | `"approved"` | `"rejected"`)
is **orthogonal to `status`**: `pending` and `rejected` posts do not publish,
even when they are scheduled and overdue.

- Pass `requestApproval: true` to hold a scheduled post for a teammate. Members
  whose role cannot publish (contributors) get it **forced on**, whatever you
  send, so always read `approvalStatus` back and say "awaiting approval", never
  "scheduled", when it is `"pending"`. A `draft` ignores the flag.
- To publish "now, once it is approved": `status: "scheduled"`, `scheduledAt` =
  the current time, `requestApproval: true`, `publishWhenApproved: true`.
- `publish_post` and `retry_post` answer **403** `APPROVAL_REQUIRED` for a role
  that cannot publish. Do not retry: submit it for approval instead.
- Reviewing, approving, rejecting and resubmitting are in the **post-approvals**
  skill.

## Publishing flow

- **Draft then publish**: `create_post` (status: "draft") → `publish_post` (postId)
- **Schedule for later**: `create_post` (status: "scheduled", scheduledAt: "2026-04-12T09:00:00Z")
- **Schedule with review**: `create_post` (status: "scheduled", scheduledAt: ..., requestApproval: true) → a teammate approves it
- **Optimal timing**: call `get_queue_slot` (optionally pass `timezone`, default UTC) to get the best next slot. It returns `{scheduledAt, dayLabel}`: pass `scheduledAt` straight to `create_post`. It does NOT take a channelId or date (any such args are ignored).
- **Retry failures**: see the **fix-failed-posts** skill. Never pass
  `republish: true` to `retry_post` before the user has checked the post is not
  already live.
- **Publish as a story**: set `postTypeOverrides` to `"story"` for Facebook,
  Instagram or Snapchat at creation time. Stories, Reels and Shorts are in the
  **video-publishing** skill.
- **Re-publish an existing post as a story**: `publish_story` (postId, platform),
  for a post already created as a regular Instagram or Facebook post.
- **Changing a post later**: editing, rescheduling, changing accounts and
  unscheduling are in the **manage-scheduled-posts** skill.

## Character limits

| Platform | Limit |
|---|---|
| X | 280 (a link counts as 23) |
| Instagram | 2,200 |
| Facebook | 63,206 |
| LinkedIn | 3,000 |
| TikTok | 2,200 |
| YouTube | 5,000 (description) |
| Threads | 500 |
| Bluesky | 300 |
| Pinterest | 500 |
| Google Business | 1,500 |
| Mastodon | 500 (a link counts as 23) |
| Discord | 2,000 |
| Telegram | 4,096 |
| Snapchat | 160 (Spotlight description; plain stories send no text) |

## Common mistakes

- `channels` takes objects `{channelId, platform}`, NOT just IDs
- Always call `list_channels` first to get valid channelId + platform pairs
- A scheduled post naming a disconnected channel returns **400** with
  `error.code: "CHANNEL_INACTIVE"` and `error.channelIds` listing them. Ask the
  user to reconnect those accounts or drop them from `channels`; a draft may
  still name one.
- `scheduledAt` is ISO 8601. A time that is now or already past is accepted and publishes immediately, so double-check the date before sending.
- To publish immediately: create as draft, then call `publish_post`
- `mediaFileIds` are numbers from `upload_media`, not file paths
- **Instagram defaults to `feed_photo`** — set `postTypeOverrides.instagram` to `reel` or `feed_video` for video
- **Pinterest board**: set `platformSpecific.pinterest.boardId` (list boards with
  `get_channel_options`). Without one, the channel's default board is used, and
  failing that a board is created for the post.
- **Never assume a scheduled post will go out** — if the response has
  `approvalStatus: "pending"`, it is held until someone approves it.
- **Content char limits** are enforced per platform — use `platformContent` for shorter versions on Pinterest (500), Bluesky (300), etc.
