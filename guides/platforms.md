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

All platforms support `_firstComment` in `platformSpecific`. After the post is published, BulkPublish automatically posts a comment on the published content:

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

BulkPublish validates content length per platform before creating the post and returns an error if any platform's limit is exceeded.
