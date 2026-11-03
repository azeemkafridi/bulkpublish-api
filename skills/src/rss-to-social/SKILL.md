---
name: rss-to-social
description: Configure and review RSS-to-social workflows that turn feed items into controlled BulkPublish drafts or posts.
profiles: full
---

# RSS to Social

Build a safe RSS automation plan or configure the BulkPublish RSS feed workflow.

## Workflow

1. Confirm the public RSS/Atom URL, source ownership, target channels, mode (`draft` or `publish`), field mapping, media behavior, and text limits.
2. Prefer `draft` mode for new feeds until output quality and deduplication are proven.
3. Create or update the feed with `create_rss_feed` / `update_rss_feed`, then inspect `enabled`, `lastCheckedAt`, and `lastError` from `list_rss_feeds`.
6. A feed that keeps failing backs off (15 minutes, doubling up to a day) and is switched off after 20 failed checks in a row: `enabled` becomes false and `lastError` says why. Re-enable it with `update_rss_feed` once the cause is fixed.
7. `requireApproval: true` holds every post the feed makes for a teammate. It is forced on for a member who cannot publish.
4. Use channel overrides only where necessary; keep same-platform copy consistent.
5. Validate media-dependent platforms and review generated posts before enabling automatic publishing.

Changing a feed URL re-baselines it and does not flood the old backlog. Explain that consequence before making that change.

## Feed reference

Auto-create posts from an RSS/Atom feed — BulkPublish checks each feed on a plan-dependent interval (every 60 minutes on Free and Lifetime, 30 on Pro, 15 on Business) and turns new items into posts. Tools: `list_rss_feeds`, `create_rss_feed`, `update_rss_feed`, `delete_rss_feed`. The REST API (`Authorization: Bearer bp_your_key`, base `https://app.bulkpublish.com`) has the same operations:

| Endpoint | Use for |
|---|---|
| `GET /api/rss-feeds` | List feeds (ordered by name) |
| `POST /api/rss-feeds` | Create — body `{name, feedUrl, channelIds, mode?, fieldMapping?}` |
| `PUT /api/rss-feeds/{id}` | Partial update — body `{name?, feedUrl?, channelIds?, mode?, fieldMapping?, enabled?}` |
| `DELETE /api/rss-feeds/{id}` | Delete |

- `mode` is `"draft"` or `"publish"`, **default `"draft"`** — draft: new feed items land as draft posts for review; publish: they are auto-published. `"publish"` needs a plan with RSS auto-publish (not Free): otherwise **403** `FEATURE_DISABLED`
- `feedUrl` must be a public http(s) RSS 2.0/Atom URL — the server validates it is reachable at create time
- `channelIds` needs at least 1 org-owned channel id; `name` max 100 chars
- The number of feeds is capped by plan (Free 1, Lifetime 3, Pro 10, Business 50); creating beyond it returns **403** with `error.code: "QUOTA_EXCEEDED"`
- **Changing `feedUrl` re-baselines the feed** (resets `lastCheckedAt`): only items newer than the change are posted — the old backlog is never flooded
- Feed object includes `enabled`, `lastCheckedAt`, `lastError` for troubleshooting
- **`fieldMapping`** (optional; `null` = default `{title}` + blank line + `{link}`, no enclosure attached, article image taken when a channel needs one) controls how an item becomes a post:
  - `template` — tokens `{title} {link} {description} {content} {author} {categories} {feedName}` plus any extra leaf field on the feed item as `{fieldName}`; a line whose tokens all render empty is dropped (max 2000 chars)
  - `mediaField` — `"none"` (default) / `"image"` / `"video"` / `"auto"` (video, else image); the enclosure is re-hosted to the org media library
  - `articleImage` — `"when_needed"` (default) / `"always"` / `"never"`; where a picture comes from when the item has no usable enclosure. `when_needed` takes one from the article the item links to, but only when a channel on the feed is on a platform that cannot publish without an image. Candidates: the article's share image, then a picture embedded in the item, then the largest pictures on the page; first one that imports cleanly and is at least 200x200 wins, max four tried. Post-level like `mediaField`, so it reaches every channel of the feed. Image-required platforms (Instagram, Pinterest, Snapchat) are skipped only when this finds nothing too; the video-only ones (TikTok, YouTube) are always skipped for items with no video — the reason lands in the activity log
  - `stripHtml` (default `true`); `truncate` — `"smart"` (default, word-boundary trim keeping a trailing link line) / `"hard"` / `"skip"` (drop that channel); `hashtags` (max 500 chars, appended)
  - `channelOverrides` — per-channel **text** overrides keyed by channel id *string* (`template`, `hashtags`, `stripHtml`, `truncate`); neither `mediaField` nor `articleImage` can be overridden per channel, and same-platform channels share one rendered text (written to the post's `platformContent`)
  - On `PUT`, send `"fieldMapping": null` to clear back to the default
