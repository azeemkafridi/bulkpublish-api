# Platform-Specific Options

## Platform Availability

Not every platform is publishable at every moment. Each one carries a
server-controlled availability state, which you can read from
`GET /api/platforms`:

| State | New connections | Existing channels | Meaning |
|-------|-----------------|-------------------|---------|
| `on` | ✅ | ✅ publish normally | Fully available. |
| `connect_off` | ❌ | ✅ publish normally | New connections are paused — typically while a platform app review is pending. Customers already connected are unaffected. |
| `off` | ❌ | ⏸ posts **held** | Kill switch. Posts are held, **not failed**, and publish automatically once the platform is re-enabled. |

Disabled platforms are always **included** in the response with `enabled: false`
and a `reason` — never omitted — so you can distinguish "switched off right now"
from "not supported".

```json
{
  "platforms": [
    {
      "platform": "tumblr",
      "displayName": "Tumblr",
      "enabled": true,
      "state": "on",
      "reason": "enabled",
      "canConnect": true,
      "canPublish": true,
      "message": null
    }
  ]
}
```

Creating or publishing a post that targets an `off` platform returns **403** with
`code: "PLATFORM_DISABLED"`:

```json
{
  "error": {
    "message": "LinkedIn is temporarily unavailable. Scheduled posts are on hold and will publish once it's back.",
    "code": "PLATFORM_DISABLED",
    "platform": "linkedin",
    "state": "off",
    "reason": "flag_off"
  }
}
```

This is distinct from `FEATURE_DISABLED`, which means the platform is not
included in the organization's plan. `PLATFORM_DISABLED` is temporary and
resolves without any action from you; `FEATURE_DISABLED` requires an upgrade.

Posts already scheduled when a platform goes `off` need no intervention — do not
delete and recreate them. They remain scheduled and publish on their own once
the platform returns.

### Variants (sub-platforms gated on their own)

Some platforms are two integrations under one name, approved separately by the
vendor. Those report a `variants` object keyed by the channel `accountType` it
covers, with the same fields as the platform itself:

```json
{
  "platform": "linkedin",
  "state": "on",
  "canConnect": true,
  "canPublish": true,
  "variants": {
    "organization": {
      "label": "LinkedIn Company Pages",
      "enabled": false,
      "state": "connect_off",
      "reason": "flag_connect_off",
      "canConnect": false,
      "canPublish": true,
      "message": "New LinkedIn Company Pages connections are paused. Pages you've already connected keep working."
    }
  }
}
```

Today the only variant is `linkedin.organization` — company pages run on a
separate LinkedIn app (Community Management API) with its own review, so pages
can be paused while personal-profile posting is fully live. The platform-level
state describes personal profiles; check the variant before offering a
company-page connect.

A variant is never more permissive than its parent: a platform in state `off`
means every variant is off too. When a variant is what blocks a write, the 403
`PLATFORM_DISABLED` error carries an extra `accountType` field naming it:

```json
{
  "error": {
    "message": "LinkedIn Company Pages are temporarily unavailable. Scheduled posts are on hold and will publish once they're back.",
    "code": "PLATFORM_DISABLED",
    "platform": "linkedin",
    "accountType": "organization",
    "state": "off",
    "reason": "flag_off"
  }
}
```


## Post Types by Platform

Use the `postTypeOverrides` field to set a specific post type per platform:

```json
{
  "postTypeOverrides": {
    "instagram": "reel",
    "facebook": "story",
    "youtube": "short"
  }
}
```

| Platform | Available Post Types |
|----------|---------------------|
| Instagram | `feed_photo`, `feed_video`, `reel`, `story`, `carousel` |
| Facebook | `post`, `reel`, `story` |
| TikTok | `video`, `photo_slideshow` |
| YouTube | `video`, `short` |
| LinkedIn | `post`, `multi_image`, `pdf_carousel`, `article` |
| Pinterest | `pin`, `video_pin`, `carousel` |
| Threads | `text`, `image`, `video`, `carousel` |
| X (Twitter) | `tweet` (use `postFormat: "thread"` for threads) |
| Bluesky | `post` (use `postFormat: "thread"` for threads) |
| Mastodon | `post` (use `postFormat: "thread"` for threads) |
| Google Business | `standard`, `event`, `offer` |
| Tumblr | `post` |
| Reddit | `post` |
| Discord | `post` |
| Telegram | `post` |

If not specified, the platform's default post type is used based on the attached media.

---

Each platform has unique features and requirements. BulkPublish lets you configure per-platform options through the `platformSpecific` field when creating or updating a post.

## Using platformSpecific

The `platformSpecific` object is keyed by platform name. Include only the platforms you want to customize:

```json
{
  "content": "New product launch!",
  "channels": [
    {"channelId": 1, "platform": "instagram"},
    {"channelId": 2, "platform": "youtube"},
    {"channelId": 3, "platform": "x"}
  ],
  "platformSpecific": {
    "instagram": {
      "collaborators": "@partner1, @partner2"
    },
    "youtube": {
      "title": "New Product Launch - Full Demo",
      "privacyStatus": "public",
      "categoryId": "28"
    },
    "x": {
      "replySettings": "following"
    }
  },
  "status": "scheduled",
  "scheduledAt": "2026-04-10T12:00:00Z"
}
```

## Per-Platform Content

If you need different text for different platforms, use `platformContent` instead of (or alongside) `platformSpecific`:

```json
{
  "content": "Default text for all platforms.",
  "platformContent": {
    "x": "Short version for X (280 chars max)",
    "linkedin": "Longer, more professional version for LinkedIn..."
  },
  "channels": [
    {"channelId": 1, "platform": "x"},
    {"channelId": 2, "platform": "linkedin"},
    {"channelId": 3, "platform": "facebook"}
  ],
  "status": "draft"
}
```

Platforms listed in `platformContent` use that text. All others fall back to the `content` field.

## Auto First Comment

Most platforms support `_firstComment` in `platformSpecific`. After the post is published, BulkPublish automatically posts a comment on the published content:

```json
{
  "content": "Check out our new feature!",
  "channels": [{"channelId": 1, "platform": "instagram"}],
  "platformSpecific": {
    "_firstComment": "Link in bio for more details! #newfeature #launch"
  },
  "status": "scheduled",
  "scheduledAt": "2026-04-10T12:00:00Z"
}
```

This is commonly used on Instagram to keep the caption clean while adding hashtags or CTAs in the first comment.

**Not every platform can post one.** Supported on X, Instagram, Facebook,
LinkedIn, YouTube, Threads, Bluesky, Mastodon, Reddit and Telegram. **Not
supported on Discord, Pinterest, TikTok, Google Business or Tumblr.**

Sending `_firstComment` to an unsupported platform does **not** fail the post.
The main post publishes normally and the comment is recorded against it as
`failed` with the reason `<Platform> does not support first comments`. So a
missing first comment on those platforms is expected behaviour, not an incident
— check the post's first-comment result rather than assuming an error dropped
it.

Note that `_firstComment` sits at the **top level** of `platformSpecific`, not
inside a platform key, so it applies to every channel on the post.

---

## Instagram

### Post Types

| Value | Description |
|-------|-------------|
| `feed_photo` | Single photo post |
| `feed_video` | Single video post |
| `reel` | Short-form vertical video |
| `story` | Photo or video story (disappears after 24h) |
| `carousel` | Up to 10 photos/videos in a swipeable post |

### Options

```json
{
  "instagram": {
    "collaborators": "@username1, @username2",
    "shareToStory": true,
    "trialReel": true,
    "graduationStrategy": "auto",
    "thumbnailTimestamp": 3.5
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `collaborators` | string | Comma-separated usernames to invite as collaborators |
| `shareToStory` | boolean | Also share the post to your story |
| `trialReel` | boolean | Post as a trial reel (limited audience first) |
| `graduationStrategy` | string | `"manual"` or `"auto"` -- how trial reels graduate to full audience |
| `thumbnailTimestamp` | number | Seconds into the video to use as the cover thumbnail |

### Notes

- Instagram requires JPEG images. BulkPublish auto-converts PNG/WebP to JPEG before publishing.
- Carousels support up to 10 items (images or videos).
- Reels must be vertical video.

---

## TikTok

### Post Types

| Value | Description |
|-------|-------------|
| `video` | Standard video upload |
| `photo_slideshow` | Photo slideshow (up to 35 images) |

### Options

```json
{
  "tiktok": {
    "privacyLevel": "PUBLIC_TO_EVERYONE",
    "disableDuet": false,
    "disableStitch": false,
    "disableComment": false,
    "isAigc": false,
    "brandContentToggle": false,
    "brandOrganicToggle": false,
    "thumbnailTimestamp": 2.0
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `privacyLevel` | string | Who can see the post (see table below) |
| `disableDuet` | boolean | Prevent others from creating duets |
| `disableStitch` | boolean | Prevent others from stitching |
| `disableComment` | boolean | Turn off comments |
| `isAigc` | boolean | Mark as AI-generated content |
| `brandContentToggle` | boolean | Mark as paid partnership |
| `brandOrganicToggle` | boolean | Mark as organic brand content |
| `thumbnailTimestamp` | number | Seconds into the video for the cover image |

### Privacy Levels

| Value | Description |
|-------|-------------|
| `PUBLIC_TO_EVERYONE` | Visible to everyone |
| `MUTUAL_FOLLOW_FRIENDS` | Visible to mutual followers |
| `FOLLOWER_OF_CREATOR` | Visible to your followers |
| `SELF_ONLY` | Visible only to you |
| `SEND_TO_USER_INBOX` | Upload to inbox for review before publishing |

### Notes

- Photo slideshows require images at most 1080px on the longest side.
- Videos must be MP4 or MOV format.

---

## YouTube

### Post Types

| Value | Description |
|-------|-------------|
| `video` | Standard YouTube video |
| `short` | YouTube Short (vertical, 3 minutes or less) |

### Options

```json
{
  "youtube": {
    "title": "My Video Title",
    "privacyStatus": "public",
    "categoryId": "28",
    "madeForKids": false,
    "playlistId": "PLxxxxxxxx",
    "thumbnailUrl": "https://example.com/thumb.jpg"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | **Required.** Video title |
| `privacyStatus` | string | `"public"`, `"unlisted"`, or `"private"` (default: `"public"`) |
| `categoryId` | string | YouTube category ID (default: `"22"` People & Blogs) |
| `madeForKids` | boolean | Whether the video is made for kids (COPPA compliance) |
| `playlistId` | string | Add the video to this playlist after upload |
| `thumbnailUrl` | string | URL of a custom thumbnail image |

### Category IDs

| ID | Category |
|----|----------|
| `1` | Film & Animation |
| `2` | Autos & Vehicles |
| `10` | Music |
| `15` | Pets & Animals |
| `17` | Sports |
| `19` | Travel & Events |
| `20` | Gaming |
| `22` | People & Blogs |
| `23` | Comedy |
| `24` | Entertainment |
| `25` | News & Politics |
| `26` | Howto & Style |
| `27` | Education |
| `28` | Science & Technology |
| `29` | Nonprofits & Activism |

### Notes

- YouTube only accepts video uploads. Text-only posts are not supported.
- The `title` field is required for all YouTube posts.
- The post's `content` field becomes the video description on YouTube.

---

## Pinterest

### Options

```json
{
  "pinterest": {
    "1": {"boardId": "board_123"},
    "title": "Pin Title",
    "description": "Pin description text",
    "link": "https://example.com/page"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `{channelId}` | object | Board selection per channel: `{"boardId": "board_id"}` |
| `title` | string | **Required.** Pin title |
| `description` | string | Pin description (overrides the post's `content` if set) |
| `link` | string | Destination URL when the pin is clicked |
| `dominantColor` | string | Hex color for the pin, e.g. `#FF5733` |
| `coverImageUrl` | string | Cover image for `video_pin` posts. Optional — when omitted, an image attached alongside the video is used, otherwise the video's auto-extracted poster frame |

### Board Selection

Pinterest requires a board for each pin. Set the board per channel ID:

```json
{
  "pinterest": {
    "5": {"boardId": "board_abc123"}
  }
}
```

You can fetch available boards for a channel:

```bash
curl "https://app.bulkpublish.com/api/channels/5/options" \
  -H "Authorization: Bearer bp_your_key_here"
```

### Notes

- A `title` is required for Pinterest pins.
- Each pin can link to one external URL.
- Video pins need a cover image. You rarely have to supply one: the server resolves `coverImageUrl` → an attached image → the video's auto-extracted poster frame, and only fails when all three are missing (e.g. a video uploaded before poster generation existed).

---

## Google Business Profile

### Post Types

| Value | Description |
|-------|-------------|
| `post` | Standard update |
| `event` | Event with dates |
| `offer` | Offer with coupon code |

### Options

```json
{
  "gmb": {
    "ctaType": "LEARN_MORE",
    "ctaUrl": "https://example.com",
    "eventTitle": "Grand Opening",
    "startDate": "2026-04-10",
    "startTime": "09:00",
    "endDate": "2026-04-10",
    "endTime": "17:00",
    "couponCode": "SAVE20",
    "redeemOnlineUrl": "https://example.com/redeem",
    "termsConditions": "Valid until April 30, 2026"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `ctaType` | string | Call-to-action button type (see table below) |
| `ctaUrl` | string | URL for the CTA button (required unless `ctaType` is `CALL`) |
| `eventTitle` | string | **Required for event/offer posts.** Title of the event or offer |
| `startDate` | string | Start date (`YYYY-MM-DD`). Required for events and offers |
| `startTime` | string | Start time (`HH:MM`). Optional |
| `endDate` | string | End date (`YYYY-MM-DD`). Required for events and offers |
| `endTime` | string | End time (`HH:MM`). Optional |
| `couponCode` | string | Coupon code (offers only) |
| `redeemOnlineUrl` | string | URL to redeem the coupon online |
| `termsConditions` | string | Terms and conditions text |

### CTA Types

| Value | Label |
|-------|-------|
| `LEARN_MORE` | Learn More |
| `BOOK` | Book |
| `ORDER` | Order |
| `SHOP` | Shop |
| `SIGN_UP` | Sign Up |
| `CALL` | Call (uses listing phone number) |

---

## X / Twitter

### Options

```json
{
  "x": {
    "replySettings": "everyone"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `replySettings` | string | Who can reply to the tweet |

### Reply Settings

| Value | Description |
|-------|-------------|
| `everyone` | Anyone can reply (default) |
| `following` | Only people you follow can reply |
| `mentionedUsers` | Only mentioned users can reply |

### Notes

- X has a 280-character limit for tweets.
- Thread posts (multi-part) are supported via `postFormat: "thread"` with `threadParts`.
- X is excluded from the Free plan. Pro or Business plan required.

---

## Threads

### Options

```json
{
  "threads": {
    "quotePostId": "12345678901234567"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `quotePostId` | string | ID of a Threads post to quote |

### Notes

- Thread posts (multi-part) are supported.
- Supports images and videos.

---

## Facebook

### Options

```json
{
  "facebook": {
    "shareToStory": true
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `shareToStory` | boolean | Also share the post to your Facebook story |

---

## LinkedIn

### Post types

Override via `postTypeOverrides.linkedin`:

| Type | Description | Media |
|------|-------------|-------|
| `post` (default) | Text post, optionally with a single image or video | 0–1 image OR 0–1 video |
| `multi_image` | Image gallery | 2–20 images |
| `pdf_carousel` | Images converted to a swipeable PDF carousel | 2–20 images |
| `article` | Link share with preview (requires `platformSpecific.linkedin.url`) | 0–1 image (thumbnail) |

### Platform-specific options (`platformSpecific.linkedin`)

| Field | Type | Notes |
|-------|------|-------|
| `url` | string | **Required** for `article`; the link to share |
| `title` | string | Article or video title |
| `description` | string | Article description |
| `carouselTitle` | string | Title shown on a `pdf_carousel` |

### Media rules

- **Images:** JPEG, PNG, GIF — up to 10 MB each, max 20 per post.
- **Video:** MP4 — up to 500 MB, 3–1800 s, max 1 per post.
- **Character limit:** 3,000.

### Account types

A connected LinkedIn channel is one of two `accountType` values, returned by `GET /api/channels`:

- `personal` — a member's personal LinkedIn profile.
- `organization` — a LinkedIn company page.

### Notes

- Connect personal profiles and company pages in the dashboard (each is a one-time
  LinkedIn authorization). Once connected they behave identically — list them with
  `GET /api/channels` and post to them by `channelId` like any other channel.
- The two run on **separate LinkedIn apps** (LinkedIn requires the Community
  Management API used by company pages to be the only product on its
  application), so they are gated separately: `GET /api/platforms` reports
  company pages under `variants.organization` while the platform-level state
  covers personal profiles. See [Variants](#variants-sub-platforms-gated-on-their-own).

---

## Bluesky

No platform-specific options. Standard post creation with text and images.

### Notes

- Thread posts (multi-part) are supported.
- Up to 4 images per post.

---

## Mastodon

No platform-specific options. Standard post creation with text, images, and videos.

### Notes

- Thread posts (multi-part) are supported.
- Up to 4 media attachments per post.
- Character limit depends on the instance (typically 500).

---

## Tumblr

```json
{
  "platformSpecific": {
    "tumblr": {
      "12": {
        "blogName": "myblog",
        "title": "An optional heading",
        "tags": ["art", "design"],
        "link": "https://example.com",
        "sourceUrl": "https://example.com/original"
      }
    }
  }
}
```

### Options

| Field | Type | Description |
|-------|------|-------------|
| `blogName` | string | Which blog to publish to. Defaults to the blog the channel was connected as. |
| `title` | string | Rendered as a heading above the post body. |
| `tags` | string[] | Tumblr tags, without the leading `#`. |
| `link` | string | Appended to the post as a link block. |
| `sourceUrl` | string | Attribution URL stored as the post's source. |

Note that `platformSpecific.tumblr` is keyed by **channel ID**, because a single
Tumblr account can own several blogs and each connected channel may target a
different one.

### Notes

- A Tumblr account usually owns multiple blogs. The channel connects as the
  account's **primary** blog; use `blogName` to publish to a different one.
  Call `GET /api/channels/{id}/options` to list the available blogs.
- Up to **30 images** per post, **or exactly one video** — a video cannot be
  mixed with images in the same post.
- Tags matter more on Tumblr than on most networks: they drive discovery.
- Posts are built with Tumblr's Neue Post Format. Content longer than 4,096
  characters is automatically split across multiple text blocks.

---

## Reddit

```json
{
  "platformSpecific": {
    "reddit": {
      "12": {
        "subreddit": "webdev",
        "title": "We rebuilt our scheduler — here's what broke",
        "flairId": "a1b2c3d4-0000-11ee-8c99-0242ac120002"
      }
    }
  }
}
```

`platformSpecific.reddit` is keyed by **channel ID**, because each connected
Reddit account commonly posts to a different subreddit. A flat object (no
channel-ID level) is also accepted and applies to every Reddit channel on the
post.

### Options

| Field | Type | Description |
|-------|------|-------------|
| `subreddit` | string | **Required.** Target subreddit. Accepts `webdev`, `r/webdev`, or `/r/webdev` — all are normalized to a bare lowercase name. Falls back to the subreddit stored on the channel if omitted. |
| `title` | string | Post title. When omitted, the first line of `content` is used, truncated to 300 characters. |
| `type` | string | Set to `link` to force a link submission. Usually unnecessary — see the kind table below. |
| `url` | string | Destination URL for a link post. Supplying it implies `type: "link"`. |
| `flairId` | string | Link-flair ID. Call `GET /api/channels/{id}/options` to list a subreddit's flairs. |
| `thumbnailUrl` | string | **Required for video posts.** Reddit rejects a video submission without a poster image. |

### How the submission kind is chosen

You do not set the kind directly. The server resolves it from the attached media
and options, in this order:

| Condition | Reddit submission kind |
|-----------|------------------------|
| An image file is attached | `image` |
| A video file is attached | `video` |
| `type` is `link`, or `url` is set | `link` |
| Otherwise | `self` (text post) |

### Notes

- A media post accepts **exactly one** file. Attaching two images, or an image
  and a video, fails validation — Reddit has no multi-asset submission.
- **Video posts require `thumbnailUrl` explicitly.** Unlike Pinterest, Reddit
  does *not* fall back to an attached image or to the video's auto-extracted
  poster frame; omitting it fails the publish with a message naming the field.
- Reddit returns HTTP 200 even when a subreddit rule rejects the submission. The
  real error arrives in the response body and is surfaced as a failed post, so
  check `errorMessage` rather than assuming success.
- Media submissions resolve **asynchronously**: Reddit confirms the permalink
  over a websocket. If it does not confirm within 20 seconds the post is marked
  failed with a message saying it may still have appeared — verify on the
  subreddit before retrying, or you risk a duplicate.
- A text post's `content` is submitted as the body, and the title is separate,
  so the first line is effectively used twice unless you set `title` yourself.
- Character limit: 40,000. Images up to 20 MB (jpg, png, gif); video up to 1 GB
  (mp4, mov).

---

## Discord

```json
{
  "platformSpecific": {
    "discord": {
      "12": { "channelId": "1090123456789012345" }
    }
  }
}
```

The **outer** key is the BulkPublish channel ID; the **inner** `channelId` is the
Discord channel (the snowflake ID of the text channel inside the server). They
are different IDs that happen to share a name — a connected Discord "channel" in
BulkPublish is an entire *server* (guild), so the message still needs a
destination channel within it.

A flat `{"channelId": "..."}` is also accepted and applies to every Discord
channel on the post, as is a default stored on the connection.

### Options

| Field | Type | Description |
|-------|------|-------------|
| `channelId` | string | **Required.** The Discord text channel to post in. Call `GET /api/channels/{id}/options` to list the server's postable channels (text, announcement, and forum channels). |

### Notes

- Publishing fails with "No Discord channel selected for this message" if no
  channel ID can be resolved from the post, a flat value, or the connection
  default.
- Posting uses a **global bot token**, not the per-user OAuth token. A publish
  failure is therefore never a re-authentication problem — the channel is never
  flagged `needs_reconnect`, and reconnecting will not fix a failed Discord post.
  The usual causes are permissions: the bot lacks access to the channel, lacks
  permission to send messages there, or the channel was deleted. Those are
  returned as plain-language errors.
- Up to **10 attachments** per message, 25 MB each — Discord's limit for a
  standard (non-boosted) server.
- **`_firstComment` is not supported.** Discord exposes no comment API to the
  bot, so a first comment is recorded as failed while the main message publishes
  normally. See [Auto First Comment](#auto-first-comment).
- Character limit: 2,000 — tighter than every platform except X (280),
  Bluesky (300), Threads / Pinterest / Mastodon (500) and Google Business
  (1,500). Use `platformContent` to supply a shorter variant rather than letting
  the post fail validation.

---

## Telegram

**No platform-specific options.** Telegram takes nothing in `platformSpecific`;
the destination chat is fixed when the channel is connected, so a post needs
only `content` and any media.

Each Telegram connection stores its own bot token (from @BotFather) together
with one target chat, which is why there is nothing to select per post. To
publish to a second channel or group, connect it as a separate BulkPublish
channel.

### Notes

- Content is sent as **plain text**, without Markdown or HTML parse mode, so
  characters like `&`, `<`, and `>` are safe and never cause a formatting error.
  Telegram still auto-links bare URLs. Markdown you write is *not* rendered.
- Telegram caps a media **caption** at 1,024 characters while a standalone
  message allows 4,096. When a post has media and text longer than 1,024
  characters, the media is sent without a caption and the full text follows as a
  **second message** — nothing is truncated, but the post arrives as two
  messages. Keep text at or under 1,024 to get a single captioned message.
- Media is handed to Telegram as a **URL** rather than uploaded, and the Bot API
  caps download-by-URL well below its upload limits: **5 MB** for images
  (jpg, png, webp) and **20 MB** for video (mp4). Oversized files are rejected
  up front rather than failing at publish time.
- Up to 10 media items per message; more than 10 are sent as additional media
  groups.
- The returned post URL is a `t.me` link for public chats and a `t.me/c/` link
  for private supergroups and channels. Basic groups have no public permalink,
  so the URL is empty for them.
- Character limit: 4,096.

---

## Post Type Overrides

When publishing to multiple platforms, you may want different post types per platform. Use `postTypeOverrides`:

```json
{
  "content": "New content!",
  "channels": [
    {"channelId": 1, "platform": "instagram"},
    {"channelId": 2, "platform": "tiktok"}
  ],
  "mediaFiles": [42],
  "postTypeOverrides": {
    "instagram": "reel",
    "tiktok": "video"
  },
  "status": "scheduled",
  "scheduledAt": "2026-04-10T12:00:00Z"
}
```

If no override is set for a platform, BulkPublish selects the default post type based on the attached media.

## Metrics by Platform

Every platform reports a **different subset** of the metric columns, and the
columns that a platform has no API for are stored as `0`. That makes "not
reported" and "measured zero" identical on the wire unless you read the support
fields — so **never present a `0` as a measurement without checking them first.**

`GET /api/posts/{id}/metrics` returns, per platform entry:

- `metricsSupported` — `false` when the platform exposes no per-post statistics API at all.
- `supportedMetrics` — the metric keys that platform can populate. Anything absent is a stored `0`.

`GET /api/analytics/engagement` returns the same information for a date range:

| Field | Meaning |
|---|---|
| `metricSupport` | platform → the metric keys it can report |
| `supportedTotals` | union across the window; a `total*` field whose key is missing here should render as "not available", never `0` |
| `partialTotals` | supported key → platforms in the window that do **not** report it, so the total covers fewer posts than it appears to |
| `conditionalMetrics` | supported but permission-gated (see the Facebook note below) |
| `unmeasuredPlatforms` | platforms present that report nothing at all |
| `metricsDisabledChannels` | channels whose metrics sync is switched off (see X below) |

### Support matrix

| Platform | Reports | Never reports |
|---|---|---|
| X | impressions, likes, comments, shares | reach, saves, clicks, video views |
| YouTube | impressions, video views, likes, comments | reach, shares, saves, clicks |
| Instagram | impressions, reach, likes, comments, shares, saves | clicks, video views |
| Facebook | likes, comments, shares + impressions, reach, clicks¹ | saves, video views |
| LinkedIn (company pages) | impressions, reach, likes, comments, shares, clicks | saves, video views |
| TikTok | impressions, video views, likes, comments, shares | reach, saves, clicks |
| Threads | impressions, likes, comments, shares | reach, saves, clicks, video views |
| Pinterest | impressions, clicks, saves, likes, comments, video views | reach |
| Bluesky | likes, comments, shares, saves (bookmarks) | impressions, reach, clicks, video views |
| Mastodon | likes, comments, shares | everything else |
| Google Business, Reddit, Discord, Telegram, Tumblr | *nothing* | — |
| LinkedIn personal profiles | *nothing* | — |

¹ Facebook's `impressions`, `reach` and `clicks` come from the Page Insights
edge and require the `read_insights` permission. Without it they stay `0` even
though the metric is listed as supported — that is "may not be readable", a
third state distinct from both a dash and a trustworthy figure. These are the
keys reported in `conditionalMetrics`.

`engagementRate` is derived as engagements ÷ impressions, so it exists exactly
where `impressions` does — it is permanently `0` for Bluesky and Mastodon.

**LinkedIn is account-type-gated.** Share statistics are exposed only for
**organization** pages. A personal/profile channel reports nothing, which is why
LinkedIn can appear in both the matrix above and in `unmeasuredPlatforms`
depending on the channel.

### Two other reasons a figure is legitimately 0

- **The snapshot has not run.** All figures come from a stored snapshot refreshed
  every 6 hours (or on demand via `POST /api/analytics/refresh`) — never a live
  read. A just-published post appears immediately with zeros.
- **Metrics sync is switched off for the channel.** X bills every read, so its
  per-post sync is **opt-in per channel** and runs at most once every 7 days.
  Until it is enabled, every X figure stays `0` and `POST /api/analytics/refresh`
  cannot change that. Affected channels are listed in `metricsDisabledChannels`.

## Character Limits

Each platform enforces its own character limit on the `content` field:

| Platform | Character Limit |
|----------|----------------|
| X / Twitter | 280 |
| Instagram | 2,200 |
| TikTok | 2,200 |
| YouTube | 5,000 (description) |
| Threads | 500 |
| Bluesky | 300 |
| Facebook | 63,206 |
| LinkedIn | 3,000 |
| Pinterest | 500 |
| Google Business | 1,500 |
| Mastodon | 500 (varies by instance) |
| Tumblr | 32,768 |
| Reddit | 40,000 |
| Discord | 2,000 |
| Telegram | 4,096 (1,024 when the text rides as a media caption) |

BulkPublish validates content length per platform before creating the post and returns an error if any platform's limit is exceeded.

### Link tracking and the limit

When link tracking is on — the organization setting, or `linkTrackingOverride` on the post — links are rewritten to `bulkpubli.sh` short URLs **at publish time**, per channel. Two accounts on the same platform get distinct codes, so their clicks are counted separately.

A short URL is 28 characters, which can be **longer** than the link it replaces. Because validation runs on the rewritten text, shortening is skipped for any channel where the rewrite would push the post past that platform's limit: a post composed at 295/300 for Bluesky publishes with its original links rather than failing at 308. The post still goes out — only the tracking is dropped for that channel, and no short link is minted for it, so `linkClicks` stays 0 there.

The tight limits above are where this bites: X (280), Bluesky (300), Threads / Pinterest / Mastodon (500), and to a lesser degree Google Business (1,500) and Discord (2,000). It never applies on Facebook, LinkedIn, Tumblr, Reddit or Telegram.
