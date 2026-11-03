---
name: video-publishing
description: Publish videos, Reels, Shorts, Spotlight and stories through BulkPublish with the right post type, length and settings for each network. Use when the user wants to post a video, a Reel, a Short or a story.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish — Video, Reels, Shorts and Stories

Upload the file first (`upload_media`), then set `postTypeOverrides` per
platform on `create_post`. One video post can go to several networks at once,
each with its own type.

## Post type per network

| Network | Video as | Length checked when it is scheduled or published |
|---|---|---|
| YouTube | `video` or `short` | — |
| Instagram | `reel` or `feed_video` (both publish as Reels) | 3s to 15min |
| Instagram story | `story` | 3s to 60s |
| Facebook | `video` or `reel` | reel 3s to 90s |
| Facebook story | `story` | 3s to 60s |
| TikTok | `video` (the default) | — |
| Snapchat | `spotlight` (video only) or `story` | spotlight 6s to 60s, story 5s to 60s |
| Snapchat saved story | `saved_story` | not checked |
| Threads | `video` | up to 5min |
| LinkedIn | `post` | 3s to 30min |
| Pinterest | `video_pin` | at least 4s |
| X, Bluesky | `video` | — |

A video outside its range is refused, naming the platform and the limit.
Instagram defaults to `feed_photo`, so a video there always needs a type.

## Settings worth asking about

- **YouTube**: `platformSpecific.youtube.title` (required), `privacyStatus`
  (`public`, `private`, `unlisted`), `madeForKids`, `categoryId`, `playlistId`
  (playlists from `get_channel_options`).
- **TikTok**: `privacyLevel` — ask; omitted, it publishes as
  `PUBLIC_TO_EVERYONE`. Also `disableDuet`, `disableStitch`, `disableComment`,
  `isAigc` for AI-made content, `thumbnailTimestamp` (cover frame, seconds),
  and `sendToDrafts: true` to deliver it to the creator's TikTok drafts instead
  (a video draft carries no caption).
- **Instagram**: `shareToFeed` (Reels), `trialReel` (shown to non-followers
  first, Reels only) with `graduationStrategy`, a cover with `coverUrl` or
  `thumbnailTimestamp` (`coverUrl` wins).
- **Facebook**: `thumbnailUrl` sets a cover just after the video publishes.
- **Pinterest**: a title and a board (`boardId` from `get_channel_options`).

## Stories

`postTypeOverrides` `"story"` on Instagram, Facebook or Snapchat publishes the
post as a story; it needs exactly one image or video. A Snapchat story sends no
caption; `saved_story` takes a `title` of up to 45 characters. To send an existing post's first media file as an extra Instagram or Facebook story, use `publish_story` (the post must already target that platform).

## Large files

`upload_media` takes files up to 100MB. For a video over 100MB, up to 1GB, use `create_multipart_upload`, PUT each 10MB part, then `complete_multipart_upload` (see the bulk-publish skill).

Show the user the type, caption and settings per network and wait for a yes
before `create_post`.
