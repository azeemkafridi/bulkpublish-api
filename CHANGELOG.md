# Changelog

## 2026-08-15 — Post engagement now covers eleven platforms, not seven

`GET /api/posts/{id}/engagement` previously returned `unsupported: true` for
eight of the fifteen platforms. Four of those eight had a readable comment API
the whole time, so the endpoint was reporting "this network has no comments"
about networks that do. Implemented in the webapp handlers and re-documented
here; the response schema is unchanged.

### Changed

- **`GET /api/posts/{id}/engagement` description** — now names exactly which
  platforms return what, instead of "e.g. TikTok".
  - **Newly returning data:** Reddit (comment tree; votes are anonymous so it
    sets `reactionsUnsupported`), Tumblr (notes — replies and
    reblogs-with-commentary become `comments`, likes and bare reblogs become
    `reactions`), Discord (reactors, plus replies in a thread started from the
    message) and X (replies via conversation search + liking users).
  - **X is gated and says so:** reads are billed per tweet and per user, so
    `comments`/`reactions` come back empty with an explanatory `notice` unless
    the channel has `metadata.metricsSyncEnabled` and the org is inside its
    daily read budget. X replies also come from recent search, which only
    covers the last 7 days.
  - **Still `unsupported: true`, now with a `notice` explaining why:** TikTok
    (comments are Research-API only), Pinterest (v5 exposes no Pin comments),
    Google Business (reviews attach to the location, not the post) and Telegram
    (a bot only learns of comments through pushed updates).

No SDK, MCP or integration change: none of them wrap this endpoint — it is
documented in `openapi.json` only.

## 2026-08-08 — Reddit, Discord and Telegram options documented (node SDK 1.8.3, python SDK 0.9.4, MCP 1.13.0)

Reddit, Discord and Telegram have been publishable for a while, but no surface
described what they accept in `platformSpecific`. Traced from the handlers
(`webapp/src/lib/platforms/reddit.ts`, `discord.ts`, `telegram.ts`) and the
worker that feeds them (`publish.worker.ts`, which passes
`post.platformSpecific[platform]` to the handler).

### Added

- **`platformSpecific.reddit`** — `{ subreddit, title, type, url, flairId, thumbnailUrl }`. `subreddit` is required, falling back to the one stored on the channel; `webdev`, `r/webdev` and `/r/webdev` are all accepted. `title` defaults to the first line of `content` truncated to 300 characters. The submission kind is derived, not set: image attached → `image`, video → `video`, `type: "link"` or `url` → `link`, else `self`. A media post accepts exactly one file. Also documented: Reddit returns HTTP 200 on a rule rejection (surfaced as a failed post), and media submissions confirm asynchronously with a 20-second timeout after which the post fails with a "may still have appeared" warning — verify before retrying to avoid a duplicate.
- **`platformSpecific.discord`** — `{ channelId }`, required. The inner `channelId` is the target Discord *text channel* snowflake, which is **not** the BulkPublish channel id used as the outer key; a connected Discord "channel" in BulkPublish is an entire server. Publishing uses a global bot token rather than the per-user OAuth token, so a failure is never a reconnect situation and the channel is never flagged `needs_reconnect` — the causes are bot permissions.
- **`platformSpecific.telegram`** — documented as accepting **no options**; the destination chat is fixed when the channel is connected. Content is sent without a parse mode (so `&`, `<`, `>` are safe and Markdown is not rendered), media is fetched by URL (5 MB images / 20 MB video, well under Telegram's upload limits), and text over the 1,024-character caption limit is posted as a second message alongside captionless media rather than being truncated.
- **The channel-id-keyed shape is now documented generally.** `reddit`, `discord` and `tumblr` nest options under the BulkPublish channel id (`{"reddit": {"12": {…}}}`) because each connected account commonly targets a different subreddit / Discord channel / blog. A flat object is also accepted and applies to every channel of that platform. Previously only the Tumblr guide mentioned this.
- **Object schemas** for `reddit`, `discord`, `telegram` and `tumblr` in `PlatformSpecific` in both OpenAPI copies — they were described in prose only (Telegram not at all) and had no `properties` entries. Character limits and post types for the four platforms were also missing from the platforms guide's tables (Reddit 40,000, Discord 2,000, Telegram 4,096, all post type `post`).
- **MCP `create_post` / `update_post`** now expose real field shapes for these four platforms instead of empty `passthrough()` objects, so a model gets field hints rather than guessing (Reddit's required `subreddit` in particular). Both the channel-keyed and flat shapes validate. `postTypeOverrides` gained the missing `mastodon`, `reddit`, `discord`, `telegram` and `tumblr` keys, all `post` — they were valid server-side but rejected by the tool schema.

### Fixed

- **`reddit.thumbnailUrl` is documented as optional, matching the handler.** An in-flight draft of this entry claimed the poster-frame fallback was never implemented; it was traced against a worktree branched before the fallback landed. `reddit.ts` does fall back to `videoFile.posterUrl`. What genuinely differs from Pinterest is that Reddit has no *attached-image* fallback — a media post accepts exactly one file, so a video post cannot also carry a cover image. Every surface says that now.
- The node SDK JSDoc and python SDK docstring for `platformSpecific` listed only eight platforms; they now cover Reddit, Discord, Telegram and Tumblr too. The node package description still advertised "11 platforms" — corrected to 15.
- **"All platforms support `_firstComment`" was wrong.** Five do not: Discord, Pinterest, TikTok, Google Business and Tumblr have no `publishComment` implementation, so the base handler returns "does not support first comments". The post still publishes and the comment is recorded as `failed` — documented in the guide and the OpenAPI description, along with the fact that `_firstComment` sits at the **top level** of `platformSpecific` rather than inside a platform key (resolution site: the first-comment block of `publish.worker.ts`, which reads it off the whole object).
- The Discord section's character-limit note and the link-tracking paragraph both omitted **Google Business (1,500)** from the list of limits tighter than Discord's 2,000.

## 2026-08-08 — Pinterest video-pin cover images (node SDK 1.8.2, python SDK 0.9.3, MCP 1.12.3)

### Added

- **Reddit video posts no longer hard-require `platformSpecific.reddit.thumbnailUrl`.** Same fallback as the Pinterest cover below: an omitted thumbnail falls back to the video's auto-extracted poster frame (resolution site: `publishPost` video branch in `webapp/src/lib/platforms/reddit.ts`); it only fails when neither exists. The webapp composer also gained media-library pickers for all three cover/thumbnail fields (Pinterest, YouTube, Reddit) — the API contract is unchanged (still URL strings).

- **`platformSpecific.pinterest.coverImageUrl`** on `POST /api/posts` / `PUT /api/posts/:id`. Pinterest requires a cover image on video pins; until now nothing could set one, so every `video_pin` failed with "A video pin needs a cover image". The field is optional: when omitted the server falls back to an image attached alongside the video, then to the video's auto-extracted poster frame (resolution site: `publishVideoPin` in `webapp/src/lib/platforms/pinterest.ts`), and fails only when all three are missing. Documented in both OpenAPI copies, the Postman collection, the node SDK JSDoc, the python SDK docstring, the `create_post`/`update_post` MCP tool schemas, and the platforms guide (which also picks up the previously undocumented `dominantColor`).

## 2026-08-05 — `platformContent` values must be strings (python SDK 0.9.2)

### Changed

- **The server now rejects non-string `platformContent` values with 400 `VALIDATION_ERROR`.** `platformContent` maps platform name → caption *string* (e.g. `{"youtube": "clip #fyp"}`). A client that sent nested objects (`{"youtube": {"content": "..."}}`) previously had them stored verbatim and the post crashed at publish time with `content.split is not a function`; the malformed shape is now caught at create/update. Documented in both OpenAPI copies. The node SDK and MCP server already typed this as string-valued (no change); the python SDK's `platform_content` tightens from `Dict[str, Any]` to `Dict[str, str]` (0.9.2 — also fixes `__version__` lagging at 0.9.0). Postman examples were already string-valued.

## 2026-08-01 — `GET /api/posts` ordering (node SDK 1.8.1, python SDK 0.9.1, MCP 1.12.2)

### Changed

- **`GET /api/posts` is ordered by the timestamp that applies to each post**, newest first: `publishedAt` if the post is live, else `scheduledAt` if it is due, else `createdAt`, with `id` descending as a tiebreaker. It previously ordered by `createdAt` alone, so a post drafted weeks before it published sorted among the day it was *written* rather than the day it went live — on a real account a post published today sat 92 rows down its own Published listing. Drafts and scheduled posts are unaffected in practice, since their applicable timestamp is the one they were already sorted by. Documented in the spec, the Postman collection, both SDK list methods, and the `list_posts` MCP tool. No request or response field changed.

## 2026-08-01 — tool descriptions no longer steer the host model (MCP 1.12.1)

Raised by the Anthropic MCP Directory review.

### Fixed

- **`get_analytics` and `search_mentions` no longer tell the model to avoid its own tools.** Their appended "use this when…" hints ended with "never use web browsing for this" and "never use built-in web search". A tool description states what the tool does and when it is useful; which tool to reach for is the host model's decision. Both hints now describe the tool only, and the comment above `TOOL_USE_HINTS` says so for future entries.
- **`search_mentions`'s hint described the wrong tool.** It read as brand/keyword monitoring across social media; the tool returns @mention *suggestions* for a single connected channel, which is what the hint now says.

## 2026-08-01 — link tracking: `linkClicks` and `linkTrackingOverride` (node SDK 1.8.0, python SDK 0.9.0, MCP 1.12.0)

Catches the public spec and every SDK up with the shortlink feature, which shipped server-side without its contract-sync fan-out.

### Added

- **`linkTrackingOverride` on `POST /api/posts` and `PUT /api/posts/:id`.** Per-post override for link tracking (`bulkpubli.sh`): `true` forces links in the post to be shortened and their clicks counted, `false` forces them to publish as written, `null` (the default) inherits the organization's Link Tracking setting. Exposed as `link_tracking_override` in the python SDK, `linkTrackingOverride` in the node SDK and on the `create_post` / `update_post` MCP tools.
- **`linkClicks` on metrics and engagement responses**, plus `totals.linkClicks` and `totalLinkClicks`. Clicks on `bulkpubli.sh` short links, measured by BulkPublish rather than reported by the platform. It sits **outside** `latest` on `GET /api/posts/:id/metrics` because it is not a platform snapshot, and it is deliberately **not** folded into `clicks`/`totalClicks` — one visit can register in both, so adding them double-counts. Because we measure it ourselves it is available on every platform, including those that report no per-post metrics at all, so `supportedMetrics` always contains it. Bot and link-preview traffic is excluded; it is 0 for organizations that have not enabled Link Tracking.
- **`sort` and `order` on `GET /api/analytics/engagement`.** `sort` accepts `date` (default), `impressions`, `likes`, `comments`, `shares` and `linkClicks`; `order` is `asc`/`desc` (default `desc`). Both apply to `allPosts`. Added to `analytics.engagement()` in both SDKs. Not surfaced on the MCP server, which has no engagement tool.
- **`largeUrl` on `MediaFile`** — the 1200px-wide webp derivative for lightboxes, alongside the existing `thumbnailUrl` (160x160 crop) and `previewUrl` (400px). For videos all three come from an extracted poster frame. `null` on media uploaded before the derivative existed, until the backfill runs.
- **`POST /api/organizations/leave`** was missing from the public spec copy.

### Documented

- **Shortening can be skipped to protect a publish.** A short URL is 28 characters and can be *longer* than the link it replaces, and validation runs on the rewritten text — so shortening is skipped for any channel where the rewrite would push the post past that platform's character limit, rather than failing a post the composer accepted. The post publishes with its original links and no short link is minted for that channel. See [Character Limits](guides/platforms.md#character-limits).
- **Python `update()` cannot clear a nullable field.** `_snake_to_camel_dict` drops `None` rather than sending JSON `null`, so `update(post_id, link_tracking_override=None)` leaves the existing override in place. Pass an explicit `True`/`False`, or call the REST endpoint directly. Pre-existing behaviour, now stated in the docstring.

### Fixed

- **`info.description` said 11 platforms.** The platform enum has carried 15 for some time (Reddit, Discord, Telegram and Tumblr were added without updating the prose). Corrected in both spec copies.
- **The public spec copy had drifted from the webapp's.** It is now rebased on `webapp/public/openapi.json` verbatim, which reorders keys throughout — the only intentional divergence left is the `/api/api-keys*` surface and its two tags, which are public-SDK-only. Diffing the two now yields nothing but those.

## 2026-07-29 — analytics accuracy: engagementRate semantics (node SDK 1.7.2, python SDK 0.8.2)

### Fixed

- **`avgEngagementRate` on `GET /api/analytics/engagement` was averaged over only the posts with non-zero engagement.** The server stores `engagement_rate` as engagements ÷ impressions and writes 0 when impressions is 0, so filtering on `rate > 0` dropped every post that genuinely got no engagement — 66% of measurable rows in production — and reported a mean over only the posts that performed. It is now averaged over every row with `impressions > 0`, which is exactly when the stored rate is meaningful. Expect this number to go DOWN, and to be correct.
- **`engagementRate` on `GET /api/analytics/account` is now `null`, never `0`.** No platform handler computes an account-level engagement rate — the internal `getAccountAnalytics` contract has no such field — so the column was its default 0 on every row and was indistinguishable from a measured 0%. Both SDKs already typed it as nullable, so this is not a breaking change. For a real rate use `platformMetrics[].engagementRate` from the engagement endpoint.

### Documented

- **`platformMetrics[].engagementRate` vs the post-level `engagementRate`** on the engagement response are different numbers: the post-level value is the mean over the post's channels that were measurable, the per-channel value is that one channel's own rate. Rendering the post-level average beside a single channel's counters shows one network's percentage next to another network's zeros.
- **`profileViews` is Facebook-only** (`page_views_total`) and **`websiteClicks` is Google-Business-only**. A 0 on any other platform means "not reported", not "measured zero".

## 2026-07-29 — RFC 9207 issuer validation on the MCP OAuth server (MCP 1.11.0)

### Added

- **`iss` on every authorization response.** RFC 9207, required by the MCP 2026-07-28 spec (SEP-2468): the authorization server names itself in the redirect back to the client, so a client configured with several authorization servers cannot be tricked into redeeming our code at a different one (the "authorization server mix-up" attack). The value is byte-identical to the `issuer` in `/.well-known/oauth-authorization-server` — including its trailing slash, which `URL.href` adds to an origin-only URL — because clients compare the two as exact strings. `authorization_response_iss_parameter_supported: true` is now advertised in the authorization-server metadata so clients know to validate it.
- **`application_type` survives Dynamic Client Registration.** SEP-837: desktop and CLI clients register as `native` so an authorization server knows not to reject their localhost redirects. It was echoed in the registration response but dropped from the sealed `client_id`, so reading the client back lost it. We accept any registered `redirect_uri`, so no request that previously worked behaves differently.

### Changed

- **Consent screen restyled to match `app.bulkpublish.com/login`.** It was styled from scratch — system font stack, bordered input, dark button, drop shadows, and an amber (`#d97706`) that is not our accent — so next to the app's own sign-in it read as a different product. Now uses the app's Inter/DM Sans, logo, card geometry, filled input, and accent pill button. The light-only palette is deliberate: the dark-mode block was where the off-brand amber lived, and the webapp is light-only.
- **`@modelcontextprotocol/ext-apps` 1.7.2 → 1.7.5.**

### Notes on MCP 2026-07-28

The v2 SDKs (`@modelcontextprotocol/core`/`server`/`client`, all 2.0.0) implement the new spec; this server still runs `@modelcontextprotocol/sdk` 1.29.0, whose newest protocol version is `2025-11-25`. Migrating is tracked separately — it retires the `initialize` handshake and `Mcp-Session-Id`, requires `Mcp-Method`/`Mcp-Name` headers, and replaces server-initiated elicitation/sampling with Multi Round-Trip Requests. Our transport is already stateless (`sessionIdGenerator: undefined`, fresh server per request), so the architectural shift is not a rewrite. Dynamic Client Registration is now formally deprecated in favour of Client ID Metadata Documents, with a twelve-month minimum window.

## 2026-07-29 — platform variants: LinkedIn company pages gated separately (node SDK 1.7.1, python SDK 0.8.1, MCP 1.10.1)

### Added

- **`variants` on `GET /api/platforms` entries** — sub-platforms gated independently of their parent, keyed by the channel `accountType` they cover. Today the only one is `linkedin.organization` (company pages): LinkedIn requires the Community Management API that company pages use to be the *only* product on its application, so pages live in a separate LinkedIn app with its own review and can be paused while personal-profile posting is fully live. The platform-level state describes personal profiles — check `variants.organization` before offering a company-page connect. Each variant carries `label`, `enabled`, `state`, `reason`, `canConnect`, `canPublish`, `message`, and (owners/admins only) `envVar`. A variant is never more permissive than its parent: a platform in state `off` means every variant is off too.
- **`accountType` on `PLATFORM_DISABLED` errors** from post create, bulk create and publish-now, naming the variant that is unavailable when a variant — rather than the whole platform — is what blocks the write. Absent when the platform itself is off.

### Fixed

- **Python package version was reported two ways.** `pyproject.toml` said 0.8.0 while `bulkpublish.__version__` still said 0.7.1. Both now read 0.8.1.

## 2026-07-28 — per-metric support on analytics responses (node SDK 1.7.0, python SDK 0.8.0, MCP 1.10.0)

### Added

- **`metricSupport`, `supportedTotals`, `partialTotals` and `conditionalMetrics` on `GET /api/analytics/engagement`**, plus **`supportedMetrics`** on every `platformMetrics` entry and on each platform of `GET /api/posts/{id}/metrics`. Platform support is not all-or-nothing: each platform reports a *different subset* of the eight metric columns, and the server stores all eight as NOT NULL integers, so a field the platform API never returns was persisted as `0` and was indistinguishable from a measured zero. X reports impressions/likes/comments/shares only — never reach, saves, clicks or video views — so an X-only account saw four confident zeroes that were not measurements. A key absent from `supportedMetrics` / `supportedTotals` must be rendered as unavailable (a dash), never as `0`. `partialTotals` names the platforms excluded from an otherwise-real total; `conditionalMetrics` flags supported-but-permission-gated metrics (Facebook insights need `read_insights`).
- **`metricsDisabledChannels` on the engagement response** — channels whose metrics sync is switched off, whose posts therefore contribute zeroes. X is the only platform this applies to: its reads are billed, so per-post sync is opt-in per channel and runs at most once every 7 days. `POST /api/analytics/refresh` will not produce X figures for a channel that has not opted in.

### Fixed

- **Bluesky reported no saves.** `app.bsky.feed.defs#postView` carries `bookmarkCount` — the atproto equivalent of a save — and it was never read. Bluesky now reports `saves`.
- **Negative counts are clamped to 0.** LinkedIn documents that `likeCount` can go negative (an unlike on a *sponsored* share counts as organic while the original like never did). Stored raw it subtracted from org-wide totals; `engagementRate` is now computed from the clamped values too.
- **Pinterest pins always reported 0 likes and 0 comments.** The server sent `metric_types=LIFETIME`, which is in neither of Pinterest's two `metric_types` enum sets. Pinterest tolerated it (the parameter's documented default is "all") so impressions, clicks and saves still came through — but an invalid value cannot request `TOTAL_REACTIONS` / `TOTAL_COMMENTS`, so engagement was permanently zero. Those are now requested explicitly, with a fallback to the standard-only metric set because video metric names are valid for video pins only.
- **Threads post metrics never returned anything.** The insights call included `reach`, which is a Threads *user*-level metric; Meta rejects the whole request when any metric is invalid. `reach` is gone (and correctly reported as unsupported for Threads), and off-platform `shares` are now summed with `reposts`.
- **Instagram account-level insights never returned anything.** The call requested `profile_views` and `website_clicks`, both removed from the IG User metric set; their replacements (`views`, `profile_links_taps`) are `total_value` metrics that cannot be combined with `period=day`. Split into two calls, so reach and views/link-taps are recorded again.

## 2026-07-28 — engagement metrics: unmeasured platforms + top-only mode (node SDK 1.6.1, python SDK 0.7.1)

### Added

- **`GET /api/quotas/usage` accepts `tz`** (IANA name, defaults to `UTC`) and the response gains **`usage.scheduledToday`** — posts scheduled FOR the current day, excluding `draft`/`failed`. It pairs with `limits.scheduledPerDay` (3/day on Free), which previously had **no** usage figure anywhere, so callers could not see the tightest limit in the product until a write 403'd. `tz` only picks the day boundary, so the figure matches the day the limit is enforced against; a malformed value falls back to `UTC`.
- Note the three post limits are distinct and must not be read interchangeably: `usage.postsToday` ↔ `limits.postsPerDay` (posts *created* today), `usage.scheduledToday` ↔ `limits.scheduledPerDay` (scheduled *for* today), `usage.pendingScheduled` ↔ `limits.maxPendingScheduled` (all pending, any date).

### Deprecated

- **`groupBy` on `analytics.engagement` (node + python) is deprecated and was always ignored.** The server has never read it; `byDay` is daily buckets, so passing `'week'`/`'month'` silently returned daily data. Aggregate client-side. The field is retained this release so existing builds keep compiling, and will be removed in the next major.

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
