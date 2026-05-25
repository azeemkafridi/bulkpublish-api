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

## Available Tools

| Tool | Description |
|------|-------------|
| **Posts** | |
| `create_post` | Create and optionally schedule a post (supports reels, stories, carousels, threads via `postTypeOverrides`) |
| `compose_post` | Open an interactive composer UI (MCP Apps) to draft/schedule a post; submits via `create_post` |
| `update_post` | Update a draft or scheduled post |
| `get_post` | Get a single post with full details |
| `list_posts` | List posts with filters (status, search, date range) |
| `delete_post` | Delete a post |
| `publish_post` | Publish a draft post immediately |
| `retry_post` | Retry a failed post |
| `get_post_metrics` | Get engagement metrics (impressions, likes, comments, shares) |
| `publish_story` | Publish as a story to Facebook or Instagram |
| `bulk_posts` | Bulk delete or retry multiple posts |
| `get_queue_slot` | Get the next optimal time slot for a channel |
| **Channels** | |
| `list_channels` | List all connected social media channels |
| `get_channel_health` | Check channel token health |
| `get_channel_options` | Get platform-specific options (boards, playlists) |
| `search_mentions` | Search users for @mention (X, Bluesky) |
| **Media** | |
| `upload_media` | Upload a media file from a URL (or local path on the stdio server) |
| `get_media` | Get a media file by ID |
| `list_media` | List uploaded media files |
| `delete_media` | Delete a media file |
| `create_media_upload` | Reserve a presigned R2 URL for a direct browser upload (used by the composer) |
| `finalize_media_upload` | Record an uploaded object as a media file after the browser PUT (used by the composer) |
| **Labels** | |
| `create_label` | Create a new label |
| `list_labels` | List all labels |
| `update_label` | Update a label name or color |
| `delete_label` | Delete a label |
| **Analytics** | |
| `get_analytics` | Get analytics summary for a date range |
| **Schedules** | |
| `list_schedules` | List recurring schedules |
| `create_schedule` | Create a recurring schedule |
| `update_schedule` | Update a schedule |
| `delete_schedule` | Delete a schedule |
| **Quota** | |
| `get_quota_usage` | Check current plan quota usage |
| **Interactive UI (MCP Apps)** | |
| `compose_post` | Open the interactive post composer (also listed above) |
| `view_analytics` | Open an interactive analytics dashboard |
| `view_posts` | Open an interactive posts list |
| `view_channels` | Open an interactive channels view |
| `view_media` | Open an interactive media gallery |
| `view_quota` | Open an interactive quota-usage view |

## Interactive UI (MCP Apps)

In hosts that support [MCP Apps](https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/) — Claude, ChatGPT, VS Code, Goose, Postman, and the Smithery playground — the **`compose_post`** tool opens an interactive composer rendered inline in the conversation: pick channels, write content, optionally schedule, then submit. On submit it calls `create_post` through the host bridge, so the sandboxed iframe never holds your API key. Hosts without MCP Apps support simply receive a plain-text summary, so nothing breaks.

Several tools render UIs — `compose_post` (composer), `view_analytics`, `view_posts`, `view_channels`, `view_media`, and `view_quota`. Each is a self-contained widget under `src/ui/<name>/`, bundled into a single HTML file with Vite (one single-input pass per widget — see `scripts/build-ui.mjs`) and inlined into the server via `src/ui/widgets.generated.ts`. They share the BulkPublish web app's design tokens (`src/ui/tokens.css`), so the look matches. A View receives its data from the triggering tool's `structuredContent` and can call other tools back through the host bridge — so the sandboxed iframe never holds your API key. Hosts without MCP Apps support simply receive a plain-text summary.

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

## License

MIT
