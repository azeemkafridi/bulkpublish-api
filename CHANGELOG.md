# Changelog

## 2026-07-28 — engagement metrics: unmeasured platforms + top-only mode (node SDK 1.6.1, python SDK 0.7.1)

### Added

- **`GET /api/analytics/engagement?top=1`** returns only the ranked `topPosts` leaderboard; `allPosts` comes back as an empty array. For dashboards that render a short list and should not download every post in the window. `bp.analytics.engagement({ top: '1' })` (node), `bp.analytics.engagement(top=True)` (python).

### Documented

- **`unmeasuredPlatforms` on the engagement response**, plus `metricsSupported` on each `platformMetrics` entry. These name the platforms in the window that cannot report per-post metrics **at all**: Google Business, Telegram, Discord, Reddit and Tumblr have no metrics API, and LinkedIn exposes share statistics only for **organization** pages — personal/profile channels never report. Posts on those platforms are still counted in every total, **with zeroes**, so a zero for one of them means "not reported", not "measured zero". Previously nothing in the response distinguished the two, and clients rendered an unmeasurable post as a confident `0 impressions`.
- The engagement figures are a **synced snapshot** (every 6 hours, or on demand via `POST /api/analytics/refresh`) — not a live read of the platform. This was never stated.

## 2026-07-25 — Tumblr platform + platform availability (mcp-server 1.9.0, node SDK 1.6.0, python SDK 0.7.0)

### Added

- **Tumblr is now supported — 15 platforms.** `tumblr` is a valid value everywhere `platform` appears (post channels, `platformContent`, `platformSpecific`, `postTypeOverrides`, the `Channel` schema). Post type is `post`; content limit 32,768 characters.
- **`platformSpecific.tumblr` is keyed by channel ID**, because one Tumblr account can own several blogs and each connected channel may target a different one. Fields: `blogName` (defaults to the blog the channel was connected as), `title` (rendered as a heading), `tags` (array, no leading `#`), `link`, `sourceUrl`. List a channel's blogs with `GET /api/channels/{id}/options`.
- Tumblr media rules: up to **30 images**, **or exactly one video** — a video cannot be mixed with images in the same post. Content over 4,096 characters is split across multiple Neue Post Format text blocks automatically.
- **`GET /api/platforms`** — returns every supported platform with its current availability (`state`, `reason`, `canConnect`, `canPublish`, `message`). Disabled platforms are **included** with `enabled: false` rather than omitted, so callers can tell "switched off right now" from "not supported". `envVar` is returned only to organization owners/admins. Exposed as `bp.platforms.list()` (node), `bp.channels.list_platforms()` (python, sync + async), and the `list_platforms` MCP tool.
- **`platformAvailable`, `platformState`, `platformMessage` on the `Channel` object** — a channel can be perfectly healthy while its platform is switched off server-side.
- **`PLATFORM_DISABLED` (403)** on `POST /api/posts`, bulk create, and `POST /api/posts/{id}/publish` when a target platform is disabled server-side. Distinct from `FEATURE_DISABLED` (not on the org's plan): `PLATFORM_DISABLED` is temporary and resolves on its own, and posts already scheduled when a platform is disabled are **held, not failed** — they publish automatically once it returns. Do not delete and recreate them.
- New "Platform Availability" section in the platforms guide covering the three states (`on` / `connect_off` / `off`) and both error codes.

### Documented

- **`PATCH /api/posts/{id}` is now in the spec** — it was previously an undocumented route. It only accepts `recurringScheduleId` (pass `null` to detach a repeat schedule); every other field is now rejected with 400 and `unsupportedFields`. **To edit a post — including moving a draft to `scheduled` — use `PUT /api/posts/{id}`** with `{"status": "scheduled", "scheduledAt": "<future ISO 8601>"}`. Previously PATCH silently ignored those fields and still returned 200, which read as success.
- `platformSpecific` prose now documents the **Reddit** (`subreddit`, `title`, `flairId`, …) and **Discord** (`channelId`) option shapes, which were never described when those platforms landed.

## 2026-07-24 — approval gating for automated sources (mcp-server 1.8.0, node SDK 1.5.0, python SDK 0.6.0)

### Added

- **`requireApproval` (boolean, default false) on recurring schedules** — `POST /api/schedules` and `PUT /api/schedules/{id}`; also returned on the schedule object. Every occurrence the schedule generates lands with `approvalStatus` `pending` and the scheduler skips it until an approver releases it via `POST /api/posts/{id}/approve`.
- **`requireApproval` (boolean, default false) on RSS autopost feeds** — `POST /api/rss-feeds` and `PUT /api/rss-feeds/{id}`. Items auto-published from the feed land as `approvalStatus` `pending` and wait for approval. Only meaningful when `mode` is `publish` (draft items never publish on their own, and a feed force-demoted to draft by the plan gate stays ungated).
- Documented that creating a post with `repeatSchedule` while the post itself is approval-gated (`requestApproval`, or a contributor role) propagates the gate onto the created recurring schedule; editing such a post keeps the schedule's gate in step.
- Surfaces updated: openapi.json (4 request bodies + the `Schedule` schema), Postman collection (schedules + rss-feeds create/update bodies), node SDK (`CreateScheduleParams`/`UpdateScheduleParams`/`RecurringSchedule`, `CreateRssFeedParams`/`UpdateRssFeedParams` + resource JSDoc), python SDK (`Schedule`/`RssFeed` types, `schedules.create/update` docs, `rss_feeds.create/update` `require_approval` kwarg sync + async), MCP server (`create_schedule`, `update_schedule`, `create_rss_feed`, `update_rss_feed`), scheduling guide ("Gating automated sources").

### Fixed

- **Node SDK `schedules` resource used a stale cron-based model.** `SchedulesResource` declared its own local `RecurringSchedule`/`CreateScheduleParams`/`UpdateScheduleParams` with `cronExpression`/`content`/`mediaFiles`, which the API does not accept. It now uses the correct `frequency`/`timeOfDay`/`dayOfWeek`/`dayOfMonth`/`contentTemplate`/`mediaFileIds` types from `types.ts`, and the class example was corrected.

## 2026-07-24 — post approval flow (mcp-server 1.7.0, node SDK 1.4.0, python SDK 0.5.0)

### Added

- **Post approval flow (team roles Phase 2).** Posts now carry `approvalStatus` (`none` (default) | `pending` | `approved` | `rejected`), plus `approvedBy`, `approvedAt`, and `rejectionReason`. Approval is orthogonal to `status`; the scheduler skips `pending`/`rejected` posts even when scheduled and overdue.
- **`requestApproval` (boolean, default false)** on `POST /api/posts` and `PUT /api/posts/{id}` — holds a scheduled post for team approval (`approvalStatus` becomes `pending`). Forced server-side for API keys of members whose role lacks `post:publish` (contributors), regardless of the flag.
- **`approvalStatus` query param on `GET /api/posts`** — e.g. `pending` for the approval queue.
- **`POST /api/posts/{id}/approve`** — requires a role with `post:approve` (owner, admin, approver); releases a pending post (publishes immediately if its `scheduledAt` has passed). **`POST /api/posts/{id}/reject`** — optional `{reason}` (max 2000 chars); returns the post to draft with `approvalStatus` `rejected`; the author is notified. Both: 400 if not pending, 403 if the role lacks `post:approve`, 404 if not found.
- **`POST /api/posts/{id}/publish`** now returns `403 APPROVAL_REQUIRED` for roles without `post:publish`; publishing a pending/rejected post as an approver implicitly approves it.
- Surfaces updated: openapi.json + Postman collection (2 new requests, `requestApproval` in create/update bodies, `approvalStatus` list filter), node SDK (`posts.approve()` / `posts.reject()`, typed Post fields, params), python SDK (`posts.approve()` / `posts.reject()` sync + async, `request_approval` / `approval_status` kwargs), MCP server (`approve_post` / `reject_post` tools, `requestApproval` on create/update, `approvalStatus` on list_posts), guides (scheduling + authentication) and READMEs.

## 2026-07-19 — post update accepts `status` (mcp-server 1.6.2, node SDK 1.3.2, python SDK 0.4.2)

### Changed

- **`PUT /api/posts/{id}` now accepts an optional `status` (`'draft'` | `'scheduled'`)** to move a post between draft and scheduled. Previously a `status` field in the update body was ignored. Setting `'scheduled'` requires a future `scheduledAt` (in the request or already stored) and at least one channel; setting `'draft'` unschedules the post. Any other value is rejected (400). Omit `status` to leave it unchanged (failed/partial posts still auto-reset to draft on edit). To publish immediately, use `POST /api/posts/{id}/publish`.
- openapi.json (+ Postman collection) requestBody and endpoint prose updated (removed the "status is ignored / cannot be changed" note). Node SDK: `status` added to `UpdatePostParams` + an `update()` example. Python SDK: `status` documented on `posts.update()`. MCP: `status` enum input added to the `update_post` tool.

## 2026-07-18 — RSS custom-field caption tokens (docs) (mcp-server 1.6.1, node SDK 1.3.1, python SDK 0.4.1)

### Changed

- **openapi.json / mcp-server / node + python SDK types**: Documented that a feed item's own extra leaf fields (namespaced or not) can be used as `{fieldName}` caption tokens in addition to the standard set — the webapp editor surfaces a feed's real fields as pills after a preview. Docs/prose only; the `template` string is forwarded unchanged.

## 2026-07-18 — RSS polling hardening + link-card behavior docs (docs only, no SDK code changes)

### Changed

- **openapi.json prose** (mirrors the webapp copy):
  - `POST /api/posts` — documented that X and Mastodon count every URL as a flat 23 characters (server-side validation now measures content this way), and documented publish-time link-card behavior for text-only posts with a URL: Facebook `link` param, Bluesky external embed, LinkedIn `content.article` (no card if the page yields no title; LinkedIn's API never scrapes URLs), other platforms self-unfurl or render plain text (Instagram/TikTok caption links are not clickable).
  - `GET /api/rss-feeds` — documented polling behavior: conditional GET (ETag/Last-Modified), exponential error backoff (15 min → 24 h), auto-disable after 20 consecutive failed polls (`enabled` flips to false, `lastError` explains), and first-successful-poll backlog baselining.
- No request/response shapes changed; SDKs and MCP server are unaffected.

## 2026-07-18 — RSS field mapping (mcp-server 1.6.0, node SDK 1.3.0, python SDK 0.4.0)

### Added

- **RSS field mapping** — `fieldMapping` on `POST /api/rss-feeds` and `PUT /api/rss-feeds/{id}` (and in every feed response; `null` = the built-in default, which matches the previous behavior: template `"{title}\n\n{link}"`, no media, `stripHtml` true, `smart` truncation). Controls how each feed item becomes a post:
  - `template` (max 2000 chars) — tokens `{title} {link} {description} {content} {author} {categories} {feedName}`; a line whose tokens all render empty is dropped (defaults traced to `DEFAULT_FIELD_MAPPING` in `webapp/src/lib/rss/mapping.ts`).
  - `mediaField` (`none` default / `image` / `video` / `auto` = video else image) — the selected item enclosure is re-hosted to the org media library and attached to the post. Media selection is post-level; channels whose platform requires media (Instagram, TikTok, YouTube, Pinterest) are **skipped** for items lacking a usable enclosure, with the reason recorded in the activity log.
  - `stripHtml` (default `true`), `truncate` (`smart` default — word-boundary trim keeping a trailing link line / `hard` / `skip` = drop that channel), `hashtags` (max 500 chars, appended).
  - `channelOverrides` — per-channel **text** overrides keyed by channel id string (`template`, `hashtags`, `stripHtml`, `truncate`; `mediaField` cannot be overridden). Rendered per-channel text is written to the post's `platformContent`, so channels on the same platform share one text — the same model as composer overrides.
  - Node SDK: `RssFieldMapping`/`RssMappingChannelOverride` types + `fieldMapping` on create/update params. Python SDK: `RssFieldMapping`/`RssMappingChannelOverride` TypedDicts + `field_mapping` kwarg (`clear_field_mapping=True` sends `fieldMapping: null`). MCP: `fieldMapping` input on `create_rss_feed`/`update_rss_feed` (nullable on update to clear).
- The webapp also gained an internal `POST /api/rss-feeds/preview` (renders the feed's newest item per channel) — intentionally **not** in openapi.json, same as bulk-create.

## 2026-07-17 — channel sets, RSS autopost, multipart media uploads (mcp-server 1.5.0, node SDK 1.2.0, python SDK 0.3.0)

### Added

- **Channel Sets** — `GET/POST /api/channel-sets` + `PUT/DELETE /api/channel-sets/{id}`: saved channel groupings for one-click multi-channel targeting. Max 50 sets per organization; names are unique per org (duplicates fail with a 409, error code `DUPLICATE_NAME`). Node SDK `bp.channelSets`, Python SDK `bp.channel_sets`, and MCP tools `list/create/update/delete_channel_set`.
- **RSS Autopost** — `GET/POST /api/rss-feeds` + `PUT/DELETE /api/rss-feeds/{id}`: RSS/Atom feeds polled every 15 minutes; new items become posts on the chosen channels. Max 20 feeds per organization. `mode` defaults to `draft` (new items become draft posts for review); `publish` auto-publishes. Changing `feedUrl` re-baselines the feed — only items published after the change are posted, so the new feed's backlog is not flooded. Node SDK `bp.rssFeeds`, Python SDK `bp.rss_feeds`, and MCP tools `list/create/update/delete_rss_feed`.
- **Multipart media uploads** — `POST /api/media/multipart/create|complete|abort`: chunked direct-to-storage uploads for large files (videos up to 1GB; images stay capped at 100MB). Fixed 10MB part size, one presigned PUT URL per part (valid 3600s), ETag collected per part so a failed part can be retried alone; `complete` runs the same verification as `/api/media/finalize` and auto-aborts on failed assembly. Node SDK `media.createMultipart/completeMultipart/abortMultipart`, Python SDK `media.create_multipart/complete_multipart/abort_multipart`, MCP tools `create/complete/abort_multipart_upload`, and a new "Multipart Uploads" section in the media guide.
- openapi.json (+ Postman collection, regenerated) updated with the 7 new endpoints and the `Channel Sets` / `RSS Autopost` tags. The MCP server now exposes **48 tools**.

## 2026-07-16 — contract-drift audit (mcp-server 1.4.0, node SDK 1.1.0, python SDK 0.2.0, MCP registry 1.2.0)

### Fixed

- **MCP `create_schedule`/`update_schedule` rewritten to the server's real model** — `frequency`/`timeOfDay`/`dayOfWeek`/`dayOfMonth`/`contentTemplate` instead of the never-implemented `cronExpression`/`content` fields. The old `create_schedule` always returned a 400; the old `update_schedule` silently ignored content/cron changes. Python SDK `Schedule` type and docstrings updated to match.
- **MCP `get_queue_slot`** now takes `timezone` (the only parameter the server reads) instead of the silently-ignored `channelId`/`date`. Same fix in the Python SDK's `posts.queue_slot()`.
- **Python SDK labels were silently dropped** on post create/update — the SDK sent `labelIds` where the server reads `labels`.
- **MCP platform naming** — `google_business` renamed to `gmb` everywhere (the server's key); `postTypeOverrides.google_business` was silently ignored before. Added `reddit`, `discord`, `telegram` to platform enums (MCP + Node SDK).
- **MCP `update_post`** no longer offers a `status` field — the server's PUT never read it (use `publish_post` or `scheduledAt`).
- **MCP `bulk_posts`** now supports `reschedule` + `scheduledAt`, and its annotation no longer mislabels it as "Bulk-create posts".
- **`deleteMediaAfterPublish` default corrected to `false`** in openapi.json, the Node SDK JSDoc, and the media guide — media is kept and reclaimed by a 3-month retention sweep; the server also forces `false` for recurring and bulk-created posts.
- **`processing` added to post-status enums** (openapi, Node SDK, MCP list filter) — posts whose platforms are all in async processing report this status.
- **Python response types rewritten to match actual API responses** — integer IDs, `postPlatforms`/`platformUrl`, `fileName`/`sizeBytes`/`originalUrl`, `accountName`/`isActive`/`tokenStatus`, structured `Schedule`, `QueueSlot.timezone`.
- **openapi.json resynced from the app spec** — adds the engagement, presign/finalize, x-usage, credits-checkout, and AI-caption endpoints, the 3 new platforms, documents the 30-day analytics window clamp and status-reset-on-edit behavior, corrects the posts `limit` maximum (500), and makes `timezone` (schedules) and channel-item `platform` optional as the server treats them. Postman collection regenerated.

## 1.2.0 (2026-05-26)

### Added

- MCP server is now hostable over **Streamable HTTP** — a multi-tenant remote endpoint (`https://mcp.bulkpublish.com/mcp`) alongside the stdio bin, so web hosts (claude.ai custom connectors, Smithery's gateway, ChatGPT Apps) can connect. Serves `/.well-known/mcp/server-card.json` (skip-scan metadata) and `/health`. Per-request API key via `?key=` / `Authorization` / config; unauthenticated `initialize`/`tools/list` so scans succeed.
- **MCP Apps composer** (`compose_post`) and five read-only `view_*` widgets (`view_analytics`, `view_posts`, `view_channels`, `view_media`, `view_quota`) that render inline in MCP Apps hosts.
- In-composer **media upload** for images and video (presigned direct-to-R2) via new tools `create_media_upload` + `finalize_media_upload`. The MCP server now exposes **37 tools**.

## 1.1.0 (2026-05-21)

### Added

- LinkedIn company pages: connect personal profiles **and** organization (company) pages from the dashboard. Both appear in `GET /api/channels` with `accountType` of `personal` or `organization` and are posted to by `channelId` like any other channel.
- Documented all LinkedIn post types — `post`, `multi_image`, `pdf_carousel`, `article` — plus media limits (images JPEG/PNG/GIF ≤10 MB, max 20; MP4 ≤500 MB, 3–1800 s) and the 3,000-character limit.
- `accountType` field on the Channel type (Python SDK; already present in the Node SDK).

### Changed

- `postTypeOverrides` LinkedIn options now list `pdf_carousel` and `article`.

### Removed

- `POST /api/channels/connect-linkedin-page` from the API spec — connecting a LinkedIn page is a one-time dashboard OAuth action, not an API operation. The API lists and posts to already-connected channels.
- `GET /api/channels/:id/options` no longer returns LinkedIn organizations (connection moved to the dashboard OAuth flow).

## 1.0.0 (2024-12-01)

### Added

- MCP server with 12 tools for Claude Desktop and other AI assistants
- Python examples: CSV bulk publish, weekly scheduling, cross-platform posting, analytics export
- Node/TypeScript examples: scheduling, upload-and-publish
- curl quick-reference with every API endpoint
- AI agent examples: LangChain, Anthropic tool_use, OpenAI function calling
