# BulkPublish MCP Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that lets Claude and other AI assistants interact with the BulkPublish social media publishing API.

## What it does

This MCP server exposes BulkPublish API operations as tools that AI assistants can call directly. You can ask Claude to schedule posts, check analytics, upload media, manage labels, and more — all through natural conversation.

## Installation

### Option 1: npx (recommended)

```bash
npx @bulkpublish/mcp-server
```

### Option 2: Global install

```bash
npm install -g @bulkpublish/mcp-server
bulkpublish-mcp
```

### Option 3: From source

```bash
git clone https://github.com/azeemkafridi/bulkpublish-api.git
cd bulkpublish-api/mcp-server
npm install
npm run build
node dist/index.js
```

> Requires Node ≥ 20.19. `npm run build` bundles the composer UI with Vite (`build:ui`), then compiles the server with `tsc`.

## Configuration

Set your API key as an environment variable:

```bash
export BULKPUBLISH_API_KEY=bp_your_api_key_here
```

Get your API key at [app.bulkpublish.com/developer](https://app.bulkpublish.com/developer).

### Claude Desktop

Add this to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bulkpublish": {
      "command": "npx",
      "args": ["-y", "@bulkpublish/mcp-server"],
      "env": {
        "BULKPUBLISH_API_KEY": "bp_your_api_key_here"
      }
    }
  }
}
```

If you installed from source:

```json
{
  "mcpServers": {
    "bulkpublish": {
      "command": "node",
      "args": ["/absolute/path/to/bulkpublish-api/mcp-server/dist/index.js"],
      "env": {
        "BULKPUBLISH_API_KEY": "bp_your_api_key_here"
      }
    }
  }
}
```

### Claude Code

Add the MCP server to your Claude Code configuration:

```bash
claude mcp add bulkpublish -- npx -y @bulkpublish/mcp-server
```

Set the environment variable in your shell profile or `.env` file:

```bash
export BULKPUBLISH_API_KEY=bp_your_api_key_here
```

## Remote / hosted server (HTTP)

The npx/stdio setup above runs the server locally. Web clients that cannot spawn a local process — **claude.ai custom connectors** and **Smithery's gateway** — connect to a hosted HTTP endpoint instead. Alongside the stdio bin, the server ships a Streamable HTTP transport (`dist/http.js`, run with `npm run start:http`):

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | MCP Streamable HTTP (stateless) |
| `GET /.well-known/mcp/server-card.json` | Static metadata so registries can skip scanning |
| `GET /health` | Liveness check |

It is **multi-tenant** — the process holds no API key. Each caller supplies their own `bp_…` key per request via the connection URL (`?key=bp_…`), a Smithery `?config=` blob, or an `Authorization: Bearer bp_…` / `X-BulkPublish-Key` header. `initialize`, `tools/list`, and `resources/*` need no key (so scans and tool discovery work); a `tools/call` without one returns `401`.

A `Dockerfile` is included:

```bash
docker build -t bulkpublish-mcp . && docker run -p 8080:8080 bulkpublish-mcp
```

Once deployed, add it to **claude.ai → Settings → Connectors → Add custom connector** as `https://<host>/mcp?key=bp_…`, or publish the `https://<host>/mcp` URL to Smithery.

### Tool profiles

The server ships three tool profiles, chosen with `BULKPUBLISH_TOOL_PROFILE`:

| Profile | Tools | Default for |
|---|---|---|
| `core` | 26 — channels, posts, media, analytics, labels, approvals, post comments, channel sync settings, and the interactive panels | The hosted HTTP server (`dist/http.js`), which is what the Claude and ChatGPT directories list |
| `inbox` | 32 — everything in `core`, plus the Inbox and comment-reply tools: `list_conversations`, `get_conversation`, `reply_to_conversation`, `update_conversation`, `reply_to_comment`, `moderate_comment` | Opt-in on a hosted deployment (`BULKPUBLISH_TOOL_PROFILE=inbox`). The `core` tools in it are identical to the `core` profile's |
| `full` | Every tool (including the Inbox and comment tools; label management, hashtag groups, templates, calendar notes, review links, client-connect links, recurring schedules, channel sets, RSS feeds, chunked uploads, quota) | The local stdio server (`npx @bulkpublish/mcp-server`) |

Set `BULKPUBLISH_TOOL_PROFILE=full` on a hosted deployment to expose everything, or `core` locally to keep a small tool list. The panels' buttons call back into `create_post`, `publish_post`, `retry_post`, `update_post`, `delete_post`, `list_channels`, `list_media`, `get_post`, `create_media_upload` and `finalize_media_upload`, so all of those are in `core`.

Every tool carries a `title` and explicit `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint` booleans; `npm run check:annotations` verifies that for every profile (add `--table` to print the per-tool justification table used in directory submissions).

## Available Tools

Tools marked ★ are in the `core` profile (see [Tool profiles](#tool-profiles)); tools marked ✉ are in `inbox` (with every ★ tool); the rest need `full`.

| Tool | Description |
|------|-------------|
| **Posts** | |
| `create_post` ★ | Create and optionally schedule a post (supports reels, stories, carousels, threads via `postTypeOverrides`) |
| `compose_post` ★ | Open an interactive composer UI (MCP Apps) to draft/schedule a post; submits via `create_post` |
| `update_post` ★ | Update a draft or scheduled post: content, timing, media, labels, the full channel list (add or drop channels), per-platform text, thread parts, assignee and recurring schedule |
| `get_post` ★ | Get a single post with full details |
| `list_posts` ★ | List posts with filters (status, search, date range, labels, recurring) |
| `delete_post` ★ | Delete a post |
| `publish_post` ★ | Publish a draft post immediately |
| `retry_post` ★ | Retry a failed post |
| `approve_post` ★ | Approve a post awaiting team approval (roles with post:approve) |
| `reject_post` ★ | Reject a pending post back to draft, with an optional reason |
| `get_post_metrics` ★ | Get engagement metrics (impressions, likes, comments, shares). Each platform entry carries `supportedMetrics` — a key not in that list is a stored `0`, not a measurement |
| `publish_story` | Publish as a story to Facebook or Instagram |
| `bulk_posts` | Bulk delete, retry or reschedule up to 100 posts |
| `get_queue_slot` ★ | Get the next optimal time slot for a channel |
| **Channels** | |
| `list_channels` ★ | List all connected social media channels |
| `get_channel_health` | Check channel token health |
| `get_channel_options` ★ | Get platform-specific options (boards, playlists) |
| `update_channel` ★ | Turn an X channel's analytics sync or DM/reply reading on or off |
| `search_mentions` | Search users for @mention (X, Bluesky, Mastodon, LinkedIn Pages — LinkedIn results carry the `vanityName` slug they matched on) |
| **Channel Sets** | |
| `list_channel_sets` | List saved channel groups for one-click multi-channel targeting |
| `create_channel_set` | Save a named group of channels (max 50 per org, names unique per org) |
| `update_channel_set` | Rename a set or change its channels |
| `delete_channel_set` | Delete a channel set |
| **RSS Autopost** | |
| `list_rss_feeds` | List RSS/Atom feeds polled every 15 minutes (new items become posts) |
| `create_rss_feed` | Add a feed (max 20 per org); `mode` = `draft` (default, items become drafts) or `publish` (auto-published); optional `fieldMapping` controls how items render (caption template, media pick, truncation, per-channel overrides) |
| `update_rss_feed` | Change, pause, or re-point a feed (changing `feedUrl` re-baselines it — the backlog is not flooded) |
| `delete_rss_feed` | Stop and remove a feed |
| **Media** | |
| `upload_media` ★ | Upload a media file from a URL (or local path on the stdio server) |
| `get_media` | Get a media file by ID |
| `list_media` ★ | List uploaded media files |
| `delete_media` | Delete a media file |
| `create_media_upload` ★ | Reserve a presigned R2 URL for a direct browser upload (used by the composer) |
| `finalize_media_upload` ★ | Record an uploaded object as a media file after the browser PUT (used by the composer) |
| `create_multipart_upload` | Start a chunked upload for large media (videos up to 1GB) — presigned URLs for fixed 10MB parts |
| `complete_multipart_upload` | Assemble the uploaded parts (partNumber + ETag each) and record the media file |
| `abort_multipart_upload` | Cancel an in-progress chunked upload and free its stored parts |
| **Labels** | |
| `create_label` | Create a new label |
| `list_labels` ★ | List all labels |
| `update_label` | Update a label name or color |
| `delete_label` | Delete a label |
| **Analytics** | |
| `get_analytics` ★ | Get analytics summary for a date range |
| **Schedules** | |
| `list_schedules` | List recurring schedules |
| `create_schedule` | Create a recurring schedule |
| `update_schedule` | Update a schedule |
| `delete_schedule` | Delete a schedule |
| **Inbox and comments** | |
| `list_conversations` ✉ | List direct messages, reviews and comment threads, newest activity first, with filters and paging (Pro and Business plans) |
| `get_conversation` ✉ | Read one conversation's messages, oldest first; does not mark it read |
| `reply_to_conversation` ✉ | Send a reply to the person on the platform right away; it cannot be unsent |
| `update_conversation` ✉ | Mark read or unread, archive or reopen, snooze, or assign a conversation; nothing is sent |
| `list_post_comments` ★ | List the comments and reactions on a published post, per channel, with the ids the reply and moderate tools take |
| `reply_to_comment` ✉ | Post a public reply to a comment right away, as the channel the post went out on |
| `moderate_comment` ✉ | Like, unlike, hide, unhide or delete a comment on the platform (delete is permanent) |
| **Account** | |
| `get_quota_usage` | Check current account usage (hidden when `BULKPUBLISH_HIDE_BILLING=1`) |
| **Interactive UI (MCP Apps)** | |
| `compose_post` ★ | Open the interactive post composer (also listed above) |
| `view_analytics` ★ | Open an interactive analytics dashboard |
| `view_posts` ★ | Open an interactive posts list |
| `view_channels` ★ | Open an interactive channels view |
| `view_media` ★ | Open an interactive media gallery |
| `view_quota` | Open an interactive account-usage view (hidden when `BULKPUBLISH_HIDE_BILLING=1`) |

## Interactive UI (MCP Apps)

In hosts that support [MCP Apps](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/) — Claude, ChatGPT, VS Code, Goose, Postman, and the Smithery playground — the **`compose_post`** tool opens an interactive composer rendered inline in the conversation: pick channels, write content, optionally schedule, then submit. On submit it calls `create_post` through the host bridge, so the sandboxed iframe never holds your API key. Hosts without MCP Apps support simply receive a plain-text summary, so nothing breaks.

Several tools render UIs — `compose_post` (composer), `view_analytics`, `view_posts`, `view_channels`, `view_media`, and `view_quota`. Each is a self-contained widget under `src/ui/<name>/`, bundled into a single HTML file with Vite (one single-input pass per widget — see `scripts/build-ui.mjs`) and inlined into the server via `src/ui/widgets.generated.ts`. They share the BulkPublish web app's design tokens (`src/ui/tokens.css`), so the look matches. A View receives its data from the triggering tool's `structuredContent` and can call other tools back through the host bridge — so the sandboxed iframe never holds your API key. Hosts without MCP Apps support simply receive a plain-text summary.

## Prompts

The server also lists ready-made prompts: starting points your MCP client shows in its prompt or slash menu (for example `/schedule_post` or `/weekly_report`). Each one tells the assistant which tools to call, the limits that apply, and to ask before anything is published, sent or deleted.

A prompt is listed only when every tool it needs is available, so what you see depends on the tool profile: **all** means every profile, including the hosted `core` server; **inbox, full** needs the `inbox` or `full` profile; **full** needs the `full` profile (the npm server's default). `plan_usage` is also left out when `BULKPUBLISH_HIDE_BILLING=1`. Prompts read nothing from your account until the assistant follows them.

| Prompt | What it does | Profiles |
|---|---|---|
| `getting_started` | A quick tour: which accounts are connected, what is scheduled next, and what was published recently. | all |
| `check_channel_connections` | Find accounts that are disconnected, need reconnecting, or have expiring access. | all |
| `platform_availability` | List every supported platform and whether it can be connected and posted to right now. | full |
| `plan_usage` | How much of the plan's posts, channels and storage are used. | full |
| `draft_post` | Write a post from an idea and save it as a draft on the accounts you choose. Nothing is published. | all |
| `schedule_post` | Write and schedule a post for a specific time, or the next free slot in your queue. | all |
| `publish_now` | Write a post and publish it immediately, after you confirm. | all |
| `add_to_queue` | Schedule a post into your next free queue slot, or at the very end of the queue. | all |
| `compose_in_editor` | Open the interactive composer, pre-filled with your text, to pick accounts and media yourself. | all |
| `cross_post_adapted` | One message rewritten to fit each platform's length, tone and format, in a single post. | all |
| `write_thread` | Turn an idea or article into a multi-part thread for X, Threads, Bluesky or Mastodon. | all |
| `post_with_media` | Upload images or a video and attach them to a new post. | all |
| `reuse_library_media` | Find a file already in your media library and build a post around it. | all |
| `video_post` | Post one video as a YouTube video or Short, TikTok, Instagram Reel, Facebook Reel and more, with the right settings for each. | all |
| `carousel_post` | A multi-image post: Instagram, Facebook or Threads carousel, Pinterest carousel, LinkedIn multi-image, TikTok photo slideshow. | all |
| `poll_post` | Post a native poll on X, LinkedIn, Threads, Mastodon, Discord or Telegram. | all |
| `repost_or_quote` | Repost or quote an existing post on X, Bluesky, Threads or Mastodon, reshare on LinkedIn, or reblog on Tumblr. | all |
| `story_post` | Post an image or short video as an Instagram, Facebook or Snapchat story. | all |
| `repeating_post` | A post that re-publishes daily, weekly, every two weeks or monthly (evergreen content, reminders). | all |
| `auto_engagement_boost` | Post a follow-up comment, or repost automatically, once a post reaches a number of likes. | all |
| `tracked_links_post` | Shorten the links in a post and count their clicks, or force links to publish as written. | all |
| `submit_for_approval` | Schedule a post that waits for a teammate to approve it before publishing. | all |
| `upcoming_posts` | Everything going out in a date range, soonest first, with gaps and clashes flagged. | all |
| `find_post` | Search posts by text, status, account, label or date. | all |
| `edit_post` | Change a draft, scheduled, failed or partial post: text, time, media, accounts or labels. | all |
| `reschedule_post` | Move a post to a new time, or to the top or bottom of the queue. | all |
| `change_post_accounts` | Add accounts to a post or drop some, keeping the rest as they are. | all |
| `unschedule_post` | Take a scheduled post off the calendar and keep it as a draft. | all |
| `delete_posts` | Clean up drafts and failed posts you no longer need. | all |
| `fix_failed_posts` | Find posts that failed or partly failed, explain why, and retry the right ones safely. | all |
| `posts_dashboard` | An interactive list of posts with status, schedule and accounts. | all |
| `my_assigned_posts` | Posts a teammate has handed to you, and what each one needs. | all |
| `posts_by_label` | List posts carrying one or more labels, e.g. one campaign. | all |
| `approval_queue` | Go through posts waiting for approval and approve or reject each one. | all |
| `resubmit_rejected` | Read why posts were rejected, revise them, and send them back for approval. | all |
| `performance_report` | Posting activity and results over a date range, optionally compared with the period before. | all |
| `weekly_report` | The last 7 days compared with the 7 before, with highlights. | all |
| `post_performance` | Likes, comments, shares, views and link clicks for one post, per platform. | all |
| `top_posts` | Rank recent published posts by engagement. | all |
| `platform_comparison` | Which networks get the most out of your posting. | all |
| `content_type_analysis` | Compare text-only, image and video posts, and single posts against threads. | all |
| `campaign_report` | Results for the posts carrying a campaign label. | all |
| `link_click_report` | Clicks on the tracked short links in your recent posts. | all |
| `analytics_dashboard` | Interactive charts for a date range. | all |
| `x_sync_settings` | Choose whether BulkPublish reads analytics, likers, messages and replies for an X account. | all |
| `read_post_comments` | Who commented and reacted on one of your published posts, per platform. | all |
| `reply_to_comments` | Draft replies to comments on a published post and post the ones you approve. | inbox, full |
| `moderate_comments` | Find spam or abusive comments on a post and hide, delete or like them. | inbox, full |
| `inbox_triage` | Sort unread messages, reviews and comment threads by urgency, and tidy them up. | inbox, full |
| `reply_to_messages` | Draft replies to unanswered direct messages and send the ones you approve. | inbox, full |
| `respond_to_reviews` | Draft thoughtful responses to customer reviews and post the ones you approve. | inbox, full |
| `inbox_search` | Find conversations by a person's name, handle or words in the messages. | inbox, full |
| `upload_files` | Add images, videos or documents to your media library for later posts. | all |
| `large_video_upload` | Upload a video over 100MB (up to 1GB) in 10MB chunks. Needs a client that can send HTTP requests itself. | full |
| `media_library_browse` | Open an interactive gallery of your uploaded media. | all |
| `alt_text_audit` | Find images without alt text and write descriptions for them. | full |
| `media_cleanup` | Find files you no longer need and delete them, without breaking scheduled posts. | full |
| `manage_labels` | Create, rename, recolour or delete the labels you tag posts and media with. | full |
| `hashtag_groups` | Research and save reusable hashtag sets, or add a saved set to a post. | full |
| `caption_templates` | Save reusable caption and first-comment text, or start a post from a saved template. | full |
| `calendar_notes` | Pin campaigns, holidays and blackout days to the calendar. Notes never publish. | full |
| `channel_sets` | Save named groups of accounts (e.g. 'All brand accounts', 'Client A') for quick targeting. | full |
| `plan_content_week` | A full week of posts across your accounts, saved as drafts or scheduled. | all |
| `plan_campaign` | A multi-week campaign: teaser, launch and follow-up posts, labelled so you can report on it. | all |
| `repurpose_content` | Turn an article, video script or newsletter into a set of posts and threads. | all |
| `recurring_schedule` | A rule that creates and publishes a post on a fixed cadence (tips, weekly roundups). | full |
| `manage_schedules` | See every recurring schedule, then pause, change or delete them. | full |
| `rss_autopost` | Turn new blog or news items into posts automatically, as drafts or published. | full |
| `rss_feed_troubleshoot` | Check every RSS feed for errors, and pause, re-point or remove them. | full |
| `client_review_link` | A link a client can open without an account to review one post or a whole batch. | full |
| `revoke_review_links` | Stop old review links from working. | full |
| `client_connect_link` | A one-time link a client opens to connect their own social account, without sharing a password or needing a BulkPublish account. | full |
| `client_onboarding` | Connect link, account group, label and a first batch of draft posts for a new client. | full |
| `post_to_facebook` | Write and schedule a post for Facebook, with its post types, settings and limits. | all |
| `post_to_instagram` | Write and schedule a post for Instagram, with its post types, settings and limits. | all |
| `post_to_x` | Write and schedule a post for X, with its post types, settings and limits. | all |
| `post_to_tiktok` | Write and schedule a post for TikTok, with its post types, settings and limits. | all |
| `post_to_youtube` | Write and schedule a post for YouTube, with its post types, settings and limits. | all |
| `post_to_threads` | Write and schedule a post for Threads, with its post types, settings and limits. | all |
| `post_to_bluesky` | Write and schedule a post for Bluesky, with its post types, settings and limits. | all |
| `post_to_pinterest` | Write and schedule a post for Pinterest, with its post types, settings and limits. | all |
| `post_to_gmb` | Write and schedule a post for Google Business Profile, with its post types, settings and limits. | all |
| `post_to_linkedin` | Write and schedule a post for LinkedIn, with its post types, settings and limits. | all |
| `post_to_mastodon` | Write and schedule a post for Mastodon, with its post types, settings and limits. | all |
| `post_to_discord` | Write and schedule a post for Discord, with its post types, settings and limits. | all |
| `post_to_telegram` | Write and schedule a post for Telegram, with its post types, settings and limits. | all |
| `post_to_tumblr` | Write and schedule a post for Tumblr, with its post types, settings and limits. | all |
| `post_to_snapchat` | Write and schedule a post for Snapchat, with its post types, settings and limits. | all |

## Example Conversation

Here is an example of using the BulkPublish tools in Claude:

**You:** Schedule a post for tomorrow at 9am EST saying "Excited to announce our new feature! Check it out at example.com" to all my connected channels.

**Claude:** Let me check your connected channels first.

*[Calls list_channels]*

You have 3 active channels:
- X/Twitter: @yourcompany (ID: 1)
- LinkedIn: Your Company Page (ID: 2)
- Instagram: @yourcompany (ID: 3)

Now I'll schedule the post for tomorrow at 9:00 AM Eastern.

*[Calls create_post with content, channels, scheduledAt: "2025-01-16T14:00:00Z", timezone: "America/New_York", status: "scheduled"]*

Done! Your post has been scheduled:
- **Post ID**: 42
- **Status**: scheduled
- **Scheduled for**: January 16, 2025 at 9:00 AM EST
- **Channels**: X/Twitter, LinkedIn, Instagram

---

**You:** How did my posts perform this month?

**Claude:** *[Calls get_analytics with from: "2025-01-01", to: "2025-01-31"]*

Here is your January analytics summary:

- **Total posts**: 28
- **Published**: 25
- **Failed**: 1
- **Scheduled (pending)**: 2
- **By platform**: X/Twitter (25 posts, 24 published), LinkedIn (20 posts, 19 published), Instagram (15 posts, all published)
- **Best day**: January 12 with 5 posts

---

**You:** Upload this image and create a draft post with it: https://example.com/product-launch.png

**Claude:** *[Calls upload_media with url]*

Image uploaded successfully (ID: 15, 1200x630px, 245KB).

*[Calls create_post with content and mediaFileIds]*

Draft post created (ID: 43) with the product launch image attached. You can review and publish it when ready.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BULKPUBLISH_API_KEY` | Yes | — | Your API key (starts with `bp_`) |
| `BULKPUBLISH_BASE_URL` | No | `https://app.bulkpublish.com` | API base URL (for self-hosted instances) |
| `BULKPUBLISH_TOOL_PROFILE` | No | `full` (stdio) / `core` (hosted HTTP) | `core`, `inbox` or `full` — see [Tool profiles](#tool-profiles) |
| `BULKPUBLISH_HIDE_BILLING` | No | — | `1` drops `get_quota_usage` and `view_quota` (only relevant with `full`; `core` never includes them) |

## License

MIT
