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
| LinkedIn | `post`, `multi_image`, `pdf_carousel`, `article`, `document`, `poll`, `reshare` |
| Pinterest | `pin`, `video_pin`, `carousel` |
| Threads | `text`, `image`, `video`, `carousel`, `repost` |
| X (Twitter) | `tweet` (use `postFormat: "thread"` for threads), `repost` |
| Bluesky | `post` (use `postFormat: "thread"` for threads), `repost` |
| Mastodon | `post` (use `postFormat: "thread"` for threads), `repost` |
| Google Business | `standard`, `event`, `offer` |
| Tumblr | `post` |
| Snapchat | `story` (default), `saved_story`, `spotlight` |
| Discord | `post` |
| Telegram | `post` |

If not specified, the platform's default post type is used based on the attached media.

### Video length

A video outside its post type's range is rejected with `400 VALIDATION_ERROR`
when the post is scheduled or published. A draft can still be saved with it.

| Platform | Post type | Video length |
|----------|-----------|--------------|
| Instagram | `reel`, `feed_video` | 3 seconds to 15 minutes |
| Instagram | `story` | 3 to 60 seconds |
| Facebook | `reel` | 3 to 90 seconds |
| Facebook | `story` | 3 to 60 seconds |
| Threads | `video`, `carousel` | up to 5 minutes |
| LinkedIn | `post` | 3 seconds to 30 minutes |
| Pinterest | `video_pin` | at least 4 seconds |
| Snapchat | `story` | 5 to 60 seconds |
| Snapchat | `spotlight` | 6 to 60 seconds |

Other post types and platforms are not length-checked. Some platforms still
apply their own limit when the post is published: TikTok's depends on the
account (3 minutes for everyone, 5 or 10 for some), and X allows 140 seconds,
or up to 4 hours on X Premium.

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
      "collaborators": "partner1, partner2"
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

## Reposts

Post type `repost` (via `postTypeOverrides`) on **X, Threads, Bluesky and Mastodon**
reposts an existing post at the scheduled time. The post's own text and media
are ignored; the target goes in `platformSpecific.<platform>.repostId`:

| Platform | Accepts |
|---|---|
| `x` | status URL or ID |
| `mastodon` | status URL or ID |
| `bluesky` | `https://bsky.app/profile/<handle>/post/<rkey>` or an `at://` URI |
| `threads` | the numeric post ID (Threads links carry a short code the API cannot resolve) |

```json
{ "content": "", "channels": [{ "channelId": 12, "platform": "x" }],
  "postTypeOverrides": { "x": "repost" },
  "platformSpecific": { "x": { "repostId": "https://x.com/jack/status/20" } } }
```

A missing or unparsable target is rejected with `400 VALIDATION_ERROR`.

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
LinkedIn, YouTube, Threads, Bluesky, Mastodon and Telegram. **Not
supported on Discord, Pinterest, TikTok, Google Business, Tumblr or Snapchat.**

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
    "collaborators": "username1, username2",
    "shareToStory": true,
    "trialReel": true,
    "graduationStrategy": "auto",
    "thumbnailTimestamp": 3.5,
    "coverUrl": "https://example.com/cover.jpg"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `collaborators` | string | Comma-separated usernames, **without a leading `@`** (the value is passed through as written). Tagged as co-authors. Post types `feed_photo`, `feed_video`, `reel` and `carousel` -- on a carousel the co-authors are set on the carousel itself, not on its individual items. Ignored on `story`, which has no co-author concept |
| `shareToStory` | boolean | Also share the post to your story |
| `trialReel` | boolean | Post as a trial reel, shown to non-followers first. **Post type `reel` only** -- ignored on `feed_video`, which publishes as an ordinary reel |
| `graduationStrategy` | string | `"manual"` or `"auto"` -- how a trial reel graduates to the full audience. Ignored unless `trialReel` is true |
| `thumbnailTimestamp` | number | Seconds into the video to use as the cover frame. Post types `feed_video` and `reel`. Ignored when `coverUrl` is set |
| `coverUrl` | string | Cover image for a video or Reel, as a public image URL. Post types `feed_video` and `reel` |
| `userTags` | array | People tagged in the post: `[{ "username": "name", "x": 0.4, "y": 0.6, "mediaIndex": 0 }]`. See below |
| `shareToFeed` | boolean | **Reels only.** `false` shows the Reel only in the Reels tab; `true` also shows it in the main feed. Omit for Instagram's own default (feed and Reels tab). Ignored on other post types |
| `locationId` | string | Digits only: the numeric ID of a Facebook Page that has a location (shown in the Page's About section). Photos, videos, Reels and carousels; not Stories. Instagram refuses the post if it does not recognise the ID as a place |

**`userTags`.** `username` is a public Instagram account (letters, numbers,
periods, underscores, up to 30 characters; a leading `@` is optional). `x` and
`y` are the person's position on the photo, from 0 to 1 measured from the top
left, and must be given together or not at all. `mediaIndex` is the item of the
post's media the tag belongs to, counting from 0 in the order the media is
attached (default 0). Up to 20 people per photo or video. On a single photo and
on each photo of a carousel a tag needs `x` and `y`; a tag without a position is
left out. On a Reel or video post people are tagged by username only: any
position is ignored and `mediaIndex` does not matter. Carousel videos and
Stories carry no tags. Tags follow position, so re-check them if you reorder the
media. An invalid username, `x` or `y` outside 0 to 1 (or only one of them), a
negative or fractional `mediaIndex`, more than 20 on one item, or a value that is
not an array is rejected with `400 VALIDATION_ERROR`; a non-boolean `shareToFeed`
or a `locationId` that is not digits is too.

### Notes

- Instagram requires JPEG images. BulkPublish auto-converts PNG/WebP to JPEG before publishing.
- Carousels support up to 10 items (images or videos).
- Reels must be vertical video.
- **A video cover, two ways.** `thumbnailTimestamp` names a moment in the video;
  `coverUrl` supplies a separate image. Instagram accepts one or the other and
  rejects a request carrying both, so when both are set only `coverUrl` is sent.
  Both apply to `feed_video` as well as `reel` — they are the same container.

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
| `sendToDrafts` | boolean | Send a `video` or `photo_slideshow` post to the creator's TikTok drafts instead of publishing it (default `false`). See below |
| `photoCoverIndex` | integer | `photo_slideshow` only: which image is the cover, a whole number 0 to 34 counting from 0 in attachment order (default 0). An index past the last attached image falls back to the first. Ignored on video posts |
| `autoAddMusic` | boolean | Photo posts published directly: lets TikTok add a recommended track (default `false`). Ignored with `sendToDrafts` |

**`sendToDrafts`.** TikTok notifies the creator in the app, where they add a
sound, choose who can view the post and publish it themselves. With
`sendToDrafts: true`, `privacyLevel` is not required, and `privacyLevel`,
`disableDuet`, `disableStitch`, `disableComment`, `isAigc`, `brandContentToggle`,
`brandOrganicToggle`, `autoAddMusic` and `thumbnailTimestamp` are ignored:
they are direct-post settings, chosen in the TikTok app for a draft. A video
draft carries **no caption** (the creator writes it in the app); a photo draft
sends the caption and honours `photoCoverIndex`. Once TikTok has the draft, the
post's TikTok destination becomes `published` with **no `platformUrl`**, because
there is no public post until the creator posts it. For about a week after that
we check whether the creator has posted it; once they have, `platformPostId`
becomes the TikTok video id, `platformUrl` is filled in, and analytics are
collected from then on. A non-boolean value is
rejected with `400 VALIDATION_ERROR`, as is a `photoCoverIndex` that is not a
whole number from 0 to 34.

### Privacy Levels

| Value | Description |
|-------|-------------|
| `PUBLIC_TO_EVERYONE` | Visible to everyone |
| `MUTUAL_FOLLOW_FRIENDS` | Visible to mutual followers |
| `FOLLOWER_OF_CREATOR` | Visible to your followers |
| `SELF_ONLY` | Visible only to you |

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
| `containsSyntheticMedia` | boolean | `true` tells YouTube the video contains realistic altered or synthetic content (a real person appearing to say or do something they did not, altered footage of real events or places, or a realistic scene that did not happen). Default: not disclosed |
| `notifySubscribers` | boolean | Only an explicit `false` changes anything: it publishes without notifying the channel's subscribers |
| `license` | string | `"youtube"` (default) or `"creativeCommon"` (Creative Commons Attribution) |
| `embeddable` | boolean | `false` stops other websites embedding the video |
| `publicStatsViewable` | boolean | `false` hides the extended statistics on the watch page |
| `defaultLanguage` | string | Language of the title and description: a language code such as `en`, `pt-BR` or `zh-Hans` |
| `defaultAudioLanguage` | string | Language spoken in the video, as a language code |
| `recordingDate` | string | When the video was recorded: `YYYY-MM-DD` or an ISO 8601 date-time (a plain date is stored as midnight UTC) |

The last eight apply to post types `video` and `short` and are sent to YouTube only
when set, so YouTube's own defaults (and the channel's upload defaults) apply
otherwise. A non-boolean, an unknown `license`, a bad language code or a bad date
is rejected with `400 VALIDATION_ERROR`.

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
| `coverKeyFrameTime` | integer | `video_pin` only: use the frame at this many seconds into the video (whole number, 0 or more) as the cover. A time past the end uses the last frame. `coverImageUrl` wins when both are sent |
| `boardSectionId` | string | Numeric ID of a section of the chosen board, sent beside its board (`{"<channelId>": {"boardId": "...", "boardSectionId": "..."}}`, or the flat pair). `pin`, `video_pin` and `carousel`. Non-numeric values are rejected with `400 VALIDATION_ERROR`. A flat `boardSectionId` is ignored for a channel that has its own `boardId`, and any section is ignored when no board was chosen and the pin goes to the default board |

List a board's sections with `GET /api/channels/{id}/options?boardId=<boardId>` on a
Pinterest channel: it answers `{ "type": "sections", "items": [{ "id", "name" }] }`
instead of the boards. A non-numeric `boardId` returns 400 `Invalid board ID`.

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
| `replySettings` | string | Who can reply to the tweet. Applies to a single post and to the first post of a thread |
| `poll` | object | `{ "options": [...], "durationMinutes": 1440 }`: 2 to 4 choices of 1 to 25 characters each (spaces trimmed) and a duration of 5 to 10080 minutes (7 days) |
| `quoteId` | string | The post to quote: its numeric ID or its `x.com` / `twitter.com` status URL. Cannot be combined with `poll` |
| `communityId` | string | Posts into an X Community: its numeric ID or its `https://x.com/i/communities/<id>` URL. The account must be a member |
| `shareWithFollowers` | boolean | With `communityId`, also shows the post to your followers (default `false`). Ignored without `communityId` |

A poll cannot be combined with media or with `quoteId`; either combination is
rejected with `400 VALIDATION_ERROR` (a poll with media is checked when the post is
scheduled or published, so a draft may hold both). On a thread, `poll`, `quoteId`
and `communityId` apply to the first post only. None of these applies to a `repost`.

### Reply Settings

| Value | Description |
|-------|-------------|
| `everyone` | Anyone can reply (default) |
| `following` | Only people you follow can reply |
| `mentionedUsers` | Only mentioned users can reply |

### Notes

- X has a 280-character limit for tweets.
- Thread posts (multi-part) are supported via `postFormat: "thread"` with `threadParts`.
  Every part is checked against the limit of every platform the post targets, so a long
  part 3 is rejected up front (400 `VALIDATION_ERROR`, naming the part) rather than
  failing mid-thread with the earlier parts already public. `platformThreadParts` lets one
  platform carry its own parts, and those are the ones checked for it.
- X is excluded from the Free plan. Pro or Business plan required.

---

## Threads

### Options

```json
{
  "threads": {
    "quotePostId": "12345678901234567",
    "topicTag": "photography",
    "locationId": "987654321"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `quotePostId` | string | ID of a Threads post to quote |
| `topicTag` | string | One topic per post, without a leading `#`. A value containing a period or an ampersand is rejected with `400 VALIDATION_ERROR`. |
| `locationId` | string | Numeric place ID from `GET /api/channels/{id}/options?q=<place>` on the Threads channel. Location search answers `{ "unavailable": true }` until the connected account has granted location tagging; reconnect the channel after it is enabled. |

Both apply to the root post of a thread, never to its replies.

| Field | Type | Description |
|-------|------|-------------|
| `replyControl` | string | Who can reply: `everyone` (default, not sent), `accounts_you_follow`, `mentioned_only`, `parent_post_author_only` (only you) or `followers_only`. Applies to the post itself (text, image, video, carousel and the first part of a thread), never to later replies in a thread; ignored on a repost. Another value is rejected with `400 VALIDATION_ERROR`, with a "did you mean" hint for upper-case spellings |
| `pollOptions` | string[] | 2 to 4 poll choices of 1 to 25 characters each (empty strings are ignored; an array with none filled means no poll). Threads only allows polls on text-only posts, so on an image, video or carousel post the poll is left out; in a thread it goes on the first part when that part has no media |
| `linkAttachment` | string | An `http(s)` URL on a public host that Threads shows as the preview card on a text post; left out on other post types. When omitted, Threads shows a card for the first link in the text. Threads refuses a post with more than 5 links in total, and a link here that differs from every link in the text counts as one more |

### Notes

- Thread posts (multi-part) are supported.
- Supports images and videos.

---

## Facebook

### Options

```json
{
  "facebook": {
    "shareToStory": true,
    "thumbnailUrl": "https://example.com/cover.jpg"
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `shareToStory` | boolean | Also share the post to your Facebook story |
| `thumbnailUrl` | string | Cover image for a video or Reel, as a public image URL. Omit to let Facebook choose a frame |
| `textFormatPresetId` | string | Digits only (a Facebook background ID). Shows a short text post on a coloured background. See below |

**`textFormatPresetId`.** Used only on a Page feed post with no photo, video or
link card and at most 130 characters; anywhere else it is left out and the post
publishes as plain text. Facebook retires backgrounds over time, so if Facebook
refuses the background the post is published once more without it rather than
failing. Anything but digits is rejected with `400 VALIDATION_ERROR`.

### Notes

- **The cover lands a moment after the post.** Facebook only accepts a cover
  once the video exists, so it is applied after the video publishes rather than
  as part of it. The post is reported successful as soon as the video is live.
- **A cover never fails a post.** If the image cannot be fetched, or Facebook
  rejects it, the video stays published with the frame Facebook chose.

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
| `document` | One PDF, Word or PowerPoint file (up to 100 MB and 300 pages), shown in the feed as a document people page through. Title from `documentTitle` | exactly 1 document, no images or videos |
| `poll` | A question with 2 to 4 answers, from `platformSpecific.linkedin.poll`. Needs post text | none |
| `reshare` | Shares an existing LinkedIn post, from `platformSpecific.linkedin.reshareId`. Post text is optional and is published alongside the shared post | none |

### Platform-specific options (`platformSpecific.linkedin`)

| Field | Type | Notes |
|-------|------|-------|
| `url` | string | **Required** for `article`; the link to share |
| `title` | string | Article or video title |
| `description` | string | Article description |
| `carouselTitle` | string | Title shown on a `pdf_carousel` |
| `documentTitle` | string | `document` posts only: the title shown above the document in the feed. Defaults to the file's name |
| `poll` | object | **Required** for `poll` posts: `{ "question": "...", "options": [...], "duration": "THREE_DAYS" }`. `question` up to 140 characters; `options` 2 to 4 strings of up to 30 characters (blank entries ignored); `duration` one of `ONE_DAY`, `THREE_DAYS` (default), `SEVEN_DAYS`, `FOURTEEN_DAYS`. Votes are visible to the author, as on LinkedIn |
| `reshareId` | string | **Required** for `reshare` posts: the post's LinkedIn link (the post's menu, "Copy link to post") or its `urn:li:share:<id>` / `urn:li:ugcPost:<id>` ID. Activity links (`urn:li:activity:<id>`) cannot be reshared and are rejected when the post is scheduled or published |
| `thumbnailUrl` | string | Cover for a `post` that carries a video: a public `http(s)` link to an image of up to 10 MB. A cover that cannot be fetched, is not an image or is too large is skipped and the video publishes with the frame LinkedIn picks |
| `visibility` | string | `PUBLIC` (default), `CONNECTIONS` (your first-degree connections; personal profiles only, on a Page it is published as `PUBLIC`) or `LOGGED_IN` (signed-in LinkedIn members). Every post type |
| `disableReshare` | boolean | `true` stops other members resharing the post (default `false`). Every post type |

Each field is optional on its own; what a post type needs is checked when the post
is scheduled or published, so a draft may be incomplete. Off-spec values are
rejected with `400 VALIDATION_ERROR`.

**Documents.** The media library accepts PDF, Word (`.doc`, `.docx`) and
PowerPoint (`.ppt`, `.pptx`) files up to 100 MB, and
`GET /api/media?type=document` lists them. A document can only be published to
LinkedIn, as a `document` post: a post that carries one and targets any other
platform, or a LinkedIn post type other than `document`, is rejected with
`400 VALIDATION_ERROR` when it is scheduled or published (a draft may hold one).

### Mentions

Write a mention straight into `content` in LinkedIn's own form:

```
Big news with @[Acme Corp](urn:li:organization:1337) and @[Jane Doe](urn:li:person:AbC-dEf)
```

- `GET /api/channels/{id}/mentions?q=<vanity-name>` on a LinkedIn channel returns ready-made Page tokens in `handle`. The lookup is an exact match on the Page's URL slug (`linkedin.com/company/<vanity-name>`), not a name search; a pasted company URL works too. A personal-profile channel borrows a connected Page's access for the lookup, and answers with a `notice` when the workspace has no Page connected.
- People have no search API; a person token needs the member's URN from elsewhere.
- On every other channel of the same post the token publishes as plain `@Acme Corp`, and it counts as `@Acme Corp` toward character limits everywhere.
- Reserved LinkedIn formatting characters in the rest of the text (`( ) [ ] { } < > | ~ _ * @ \`) are escaped at publish time, so they appear literally. `#hashtags` still work.

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

Standard post creation with text and images. Optional `platformSpecific.bluesky` settings:

| Field | Type | Description |
|-------|------|-------------|
| `replyAllow` | string[] | Who can reply. Omitted or `[]` means everyone; otherwise `["nobody"]`, or any mix of `mention` (accounts mentioned in the post), `following` (accounts you follow) and `follower` (your followers). `"nobody"` cannot be combined with other values. Set right after the post publishes; if Bluesky refuses it, the post stays published without it |
| `allowQuotes` | boolean | `false` stops other accounts quoting the post (default `true`). Set right after publishing, like `replyAllow` |
| `quoteId` | string | The post to quote: a `https://bsky.app/profile/<handle>/post/<id>` link or an `at://` URI (a bare ID is read as one of your own posts). A quote replaces a link card; with images or a video attached both appear together. If the post cannot be found, publishing fails before anything is posted |
| `langs` | string[] | Up to 3 language codes, such as `en` or `pt-BR` |
| `contentLabel` | string | A content warning: `sexual`, `nudity`, `porn` or `graphic-media` |

On a thread, `replyAllow`, `allowQuotes` and `quoteId` apply to the first post;
`langs` and `contentLabel` apply to every part. None applies to a `repost`. Bad
values are rejected with `400 VALIDATION_ERROR`.

### Notes

- Thread posts (multi-part) are supported.
- Up to 4 images per post.

---

## Mastodon

Standard post creation with text, images, and videos. Optional `platformSpecific.mastodon` settings:

| Field | Type | Description |
|-------|------|-------------|
| `poll` | object | `{ "options": [...], "expiresIn": 86400, "multiple": false, "hideTotals": false }`: 2 to 4 choices of 1 to 50 characters, `expiresIn` in seconds from 300 to 2629746, `multiple` lets voters pick more than one choice, `hideTotals` hides counts until the poll ends. Cannot be combined with media. A server configured with tighter limits refuses the post at publish time with its own message |
| `sensitive` | boolean | Hides the attached media behind a click (default `false`). No effect on a post without media |
| `quoteId` | string | The post to quote: its URL, or its status ID on your own server (a URL from another server is looked up from your account first). Needs a server running Mastodon 4.5 or later; on an older server publishing fails with "Your Mastodon server does not support quote posts yet" and nothing is posted. If the quoted author does not allow quotes, Mastodon refuses the post |

On a thread, `poll` and `quoteId` apply to the first post; `sensitive` applies to
every part. None applies to a `repost`. A poll with media is rejected with
`400 VALIDATION_ERROR` when the post is scheduled or published (a draft may hold both).

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
| `state` | string | `published` (default), `queue`, `draft` or `private`. A scheduled post with `published` still goes out at its scheduled time; `draft` and `private` override that and the post is never made public by BulkPublish. |
| `slug` | string | Up to 200 characters; lowercased and hyphenated into the permalink. |
| `reblogInteraction` | string | Who can reblog the post: `everyone` or `noone`. |
| `reblogUrl` | string | A Tumblr post link (`tumblr.com/<blog>/<id>` or `<blog>.tumblr.com/post/<id>`): publishes a reblog of that post with your text as the comment. Anything else is rejected with `400 VALIDATION_ERROR`. |

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

## Snapchat

```json
{
  "platformSpecific": {
    "snapchat": {
      "12": {
        "title": "Behind the scenes",
        "locale": "en_US",
        "saveToProfile": true
      }
    }
  }
}
```

### Post types

Set via `postTypeOverrides.snapchat` — one of `story`, `saved_story`, `spotlight`:

| Type | Media | Text behaviour |
|------|-------|----------------|
| `story` (default) | exactly 1 image or video | The caption is **not** sent to Snapchat — stories carry no text. |
| `saved_story` | exactly 1 image or video | Published as a Saved Story with a `title` (max 45 chars; defaults to the first line of the caption, truncated). |
| `spotlight` | video only, 6–60s | The caption becomes the Spotlight description (max 160 chars, truncated); hashtags in it are clickable. |

### Options

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Saved Story title, max 45 chars. Defaults to the first line of the caption, truncated. |
| `locale` | string | Spotlight locale, e.g. `en_US` (the default). |
| `saveToProfile` | boolean | Spotlight only. Default `true`; `false` sends `skip_save_to_profile` to Snap. |

Like Discord and Tumblr, `platformSpecific.snapchat` is keyed by
**channel ID** (a flat object is also accepted and applies to every Snapchat
channel on the post).

### Notes

- Every Snapchat post requires **exactly one** media file — images as jpg/png,
  videos as mp4/mov, vertical, max 1GB. Story video is 5–60 seconds and
  Spotlight 6–60s; Snap documents no length for a Saved Story, so none is checked.
  A video outside its range is rejected with `400 VALIDATION_ERROR` when the
  post is scheduled or published; a draft can still be saved with it.
- First comments (`_firstComment`) are **not** supported on Snapchat.
- Engagement (individual comments/reactions) is not readable; per-post metrics
  are (see [Metrics by Platform](#metrics-by-platform)).

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
| `silent` | boolean | Suppresses notifications for the message. |
| `buttons` | array | Link buttons, up to 5: `[{ "label": "...", "url": "https://..." }]`, label up to 80 characters. |
| `startThread` | boolean | Starts a thread from the message, named by `threadName` (up to 100 characters). No effect on a forum channel, where each post is already its own thread. |
| `embed` | object | `{ "title": "...", "color": "blue" }`: sends the text as a rich embed with the first image inside. `title` up to 256 characters; `color` one of `orange`, `blue`, `green`, `red`, `purple`, `gray`. |
| `poll` | object | A native poll: `question` (up to 300 characters), `answers` (2 to 10, each up to 55 characters), `durationHours` (whole number 1 to 768, default 24), `multiselect` (boolean). |
| `pin` | boolean | Pins the message. If Discord refuses, the post stays published and a warning is recorded. |
| `tags` | string[] | Up to 5 forum tag IDs (digits) for a forum channel; the channels and tag IDs come from `GET /api/channels/{id}/options`. |

Pinning and polls need the bot to hold the Pin Messages and Send Polls permissions.
Servers where the bot was added earlier must grant them in the server's role
settings, otherwise those options are refused by Discord. Values outside these
limits are rejected with `400 VALIDATION_ERROR` naming the path.

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

The destination chat is fixed when the channel is connected, so a post needs
only `content` and any media. Optional `platformSpecific.telegram` settings,
nested under the BulkPublish channel id (or flat, to apply to every Telegram
channel on the post):

| Field | Type | Description |
|-------|------|-------------|
| `silent` | boolean | Send without a notification sound. |
| `protectContent` | boolean | Recipients cannot forward or save the message. |
| `pin` | boolean | Pin the message after sending. If the bot lacks the right to pin, the post still publishes and a warning is recorded. |
| `threadId` | string or number | Forum topic to post into: digits only, up to 12. |
| `buttons` | array | Link buttons under the message, up to 3: `[{ "label": "...", "url": "https://..." }]`, label up to 64 characters. |
| `spoiler` | boolean | Hides a photo or video behind a spoiler. |
| `disablePreview` | boolean | Turns off the link preview. |
| `poll` | object | Sent as a poll after the message: `question` (1 to 300 characters, required), `options` (2 to 12 answers, each up to 100 characters), `anonymous` (default `true`), `multipleAnswers` (default `false`), `quiz` (default `false`), `correctOption` (0-based index of the right answer, required when `quiz` is `true`). `multipleAnswers` cannot be combined with `quiz`. |

A blank button or poll answer row is dropped; anything else outside these limits is
rejected with `400 VALIDATION_ERROR` naming the path. Attached GIFs, audio and
other files are sent as an animation, an audio file or a document according to
their type.

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

- `metricsSupported` — `false` when the platform has no readable per-post statistics API (Tumblr reports only a combined note count that cannot be split).
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
| X | impressions, likes, comments, shares, saves (bookmarks) | reach, clicks, video views |
| YouTube | impressions, video views, likes, comments | reach, shares, saves, clicks |
| Instagram | impressions, reach, likes, comments, shares, saves | clicks, video views |
| Facebook | likes, comments, shares + impressions, reach, clicks¹ | saves, video views |
| LinkedIn (company pages) | impressions, reach, likes, comments, shares, clicks | saves, video views |
| TikTok | impressions, video views, likes, comments, shares | reach, saves, clicks |
| Threads | impressions, likes, comments, shares | reach, saves, clicks, video views |
| Pinterest | impressions, clicks, saves, likes, comments, video views | reach |
| Bluesky | likes, comments, shares, saves (bookmarks) | impressions, reach, clicks, video views |
| Mastodon | likes, comments, shares | everything else |
| Discord | likes (reaction counts), comments (thread replies) | everything else |
| Snapchat | impressions, reach, likes, comments, shares, clicks, video views | saves |
| Google Business, Telegram, Tumblr | *nothing* | — |
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
| Discord | 2,000 |
| Telegram | 4,096 (1,024 when the text rides as a media caption) |
| Snapchat | 160 (used only as the Spotlight description / Saved Story title fallback — plain stories send no text) |

BulkPublish validates content length per platform before creating the post and returns an error if any platform's limit is exceeded.

### Link tracking and the limit

When link tracking is on — the organization setting, or `linkTrackingOverride` on the post — links are rewritten to `bulkpubli.sh` short URLs **at publish time**, per channel. Two accounts on the same platform get distinct codes, so their clicks are counted separately.

A short URL is 28 characters, which can be **longer** than the link it replaces. Because validation runs on the rewritten text, shortening is skipped for any channel where the rewrite would push the post past that platform's limit: a post composed at 295/300 for Bluesky publishes with its original links rather than failing at 308. The post still goes out — only the tracking is dropped for that channel, and no short link is minted for it, so `linkClicks` stays 0 there.

The tight limits above are where this bites: X (280), Bluesky (300), Threads / Pinterest / Mastodon (500), and to a lesser degree Google Business (1,500) and Discord (2,000). It never applies on Facebook, LinkedIn, Tumblr or Telegram.
