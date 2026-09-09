---
name: media-preflight
description: Preflight social media images and videos against BulkPublish platform, post-type, size, format, aspect-ratio, and duration requirements before publishing.
---

# Media Preflight

Catch media and metadata problems before they create failed or partial social posts.

## Checks

1. Identify each target platform and intended post type.
2. Confirm every required media item exists, is readable, and uses a supported format and size.
3. Check platform-specific constraints such as Instagram video post types, TikTok/YouTube video requirements, Pinterest titles and boards, and carousel item counts.
4. Check dimensions, aspect ratio, duration, number of files, caption length, and required `platformSpecific` fields.
5. Report pass, warning, or blocking failure for each platform, with the exact correction needed.

Consult `platform-reference` for the current BulkPublish requirements. Do not upload, create, schedule, or publish a post while a blocking preflight issue remains unless the user explicitly chooses to proceed.
