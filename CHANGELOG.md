# Changelog

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
