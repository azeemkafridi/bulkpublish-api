# BulkPublish API

**The free social media API built for automation, AI agents, and LLMs.**

Programmatically publish to 11 platforms from a single API call. Built for developers, AI agents, LLMs, and agentic workflows that need reliable social media automation without browser sessions or manual interaction.

```python
from bulkpublish import BulkPublish

bp = BulkPublish("bp_your_key_here")
bp.posts.create(
    content="Launching our new product today!",
    channels=[{"channelId": 1, "platform": "x"}, {"channelId": 2, "platform": "linkedin"}],
    status="scheduled",
    scheduled_at="2026-04-10T09:00:00Z",
)
```

## Why BulkPublish?

Most social media tools are built for humans clicking buttons. BulkPublish is built for **code** — whether that code is written by a developer, an AI agent, an LLM with tool use, or an autonomous workflow.

- **Headless by design** — No browser, no UI, no OAuth pop-ups at runtime. Connect accounts once in the dashboard, then automate everything via API.
- **AI-native** — MCP server for Claude, tool definitions for GPT and LangChain, structured JSON responses that LLMs parse reliably.
- **Agentic-ready** — Deterministic API with clear error codes. AI agents can create posts, check status, retry failures, and read analytics autonomously.
- **11 platforms, one endpoint** — Facebook, Instagram, X/Twitter, TikTok, YouTube, Threads, Bluesky, Pinterest, Google Business Profile, LinkedIn, Mastodon.

## Use Cases

- **AI social media managers** — Let Claude, GPT, or custom agents schedule and publish posts autonomously
- **Content pipelines** — RSS-to-social, blog-to-social, newsletter-to-social automation
- **Bulk scheduling** — Upload a CSV or feed a content calendar and schedule weeks of posts programmatically
- **Cross-platform syndication** — Publish once to all platforms with per-platform content optimization
- **Analytics dashboards** — Pull engagement data into your own tools, spreadsheets, or AI analysis
- **Zapier/n8n/Make alternatives** — Direct API access without middleware, lower latency, more control
- **LLM-powered content creation** — Generate content with AI, publish it with BulkPublish, track performance, iterate

## Quick Start

### 1. Sign up

Create a free account at [app.bulkpublish.com](https://app.bulkpublish.com/register).

### 2. Get your API key

Go to **Settings > Developer** in the dashboard and create an API key. Keys start with `bp_` and are shown only once — save it securely.

### 3. Connect platforms

Connect your social accounts in the dashboard under **Channels**. The API uses your connected channels to publish.

### 4. Install an SDK

**Python**

```bash
pip install bulkpublish
```

**Node.js**

```bash
npm install bulkpublish
```

**Homebrew (macOS/Linux)**

```bash
brew tap azeemkafridi/bulkpublish && brew install bulkpublish
```

Or call the REST API directly with `curl`, `fetch`, `requests`, or any HTTP client.

### 5. Make your first API call

```bash
curl -X POST https://app.bulkpublish.com/api/posts \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "Hello from the BulkPublish API!",
    "channels": [{"channelId": 1, "platform": "linkedin"}],
    "status": "draft"
  }'
```

## AI Agent Integration

### MCP Server (Claude, Cursor, Windsurf, Claude Code)

BulkPublish ships an MCP server so AI assistants can manage your social media directly:

```json
{
  "mcpServers": {
    "bulkpublish": {
      "command": "npx",
      "args": ["-y", "@bulkpublish/mcp-server"],
      "env": {
        "BULKPUBLISH_API_KEY": "bp_your_key_here"
      }
    }
  }
}
```

12 tools available: `create_post`, `list_channels`, `upload_media`, `get_analytics`, and more. See [mcp-server/README.md](mcp-server/README.md).

### LLM Tool Use / Function Calling

Ready-made tool definitions for autonomous AI agents:

- **[Claude tool_use example](examples/ai-agents/claude_tool_use.py)** — Anthropic SDK with tool definitions for scheduling posts
- **[OpenAI function calling example](examples/ai-agents/openai_function.py)** — GPT-4 with functions for post management
- **[LangChain tool example](examples/ai-agents/langchain_tool.py)** — LangChain agent with BulkPublish tools

All examples are complete, runnable scripts with error handling.

## Code Examples

### Create a Post

<table>
<tr><th>Python</th><th>Node.js</th></tr>
<tr>
<td>

```python
from bulkpublish import BulkPublish

bp = BulkPublish("bp_your_key_here")

post = bp.posts.create(
    content="Check out our latest update!",
    channels=[
        {"channelId": 1, "platform": "facebook"},
        {"channelId": 2, "platform": "x"},
        {"channelId": 3, "platform": "linkedin"},
    ],
    status="draft",
)
```

</td>
<td>

```typescript
import { BulkPublish } from 'bulkpublish';

const bp = new BulkPublish({ apiKey: 'bp_your_key_here' });

const post = await bp.posts.create({
  content: 'Check out our latest update!',
  channels: [
    { channelId: 1, platform: 'facebook' },
    { channelId: 2, platform: 'x' },
    { channelId: 3, platform: 'linkedin' },
  ],
  status: 'draft',
});
```

</td>
</tr>
</table>

### Schedule a Post

```python
post = bp.posts.create(
    content="This will go out tomorrow morning.",
    channels=[{"channelId": 1, "platform": "instagram"}],
    status="scheduled",
    scheduled_at="2026-04-10T09:00:00Z",
    timezone="America/New_York",
)
```

### Upload Media and Publish

```python
media = bp.media.upload("./product-photo.jpg")

post = bp.posts.create(
    content="Our newest product is here.",
    channels=[{"channelId": 1, "platform": "instagram"}],
    media_files=[media["file"]["id"]],
    status="scheduled",
    scheduled_at="2026-04-10T12:00:00Z",
)
```

### Automation Example: Bulk Schedule from CSV

```python
import csv
from bulkpublish import BulkPublish

bp = BulkPublish("bp_your_key_here")
channels = bp.channels.list()["channels"]

with open("content-calendar.csv") as f:
    for row in csv.DictReader(f):
        bp.posts.create(
            content=row["content"],
            channels=[{"channelId": ch["id"], "platform": ch["platform"]} for ch in channels],
            status="scheduled",
            scheduled_at=row["scheduled_at"],
            timezone="America/New_York",
        )
```

More examples in [`examples/`](examples/) — including [Python automation scripts](examples/python/), [Node.js examples](examples/node/), [curl reference](examples/curl/), and [AI agent integrations](examples/ai-agents/).

## Features

- **11 platforms** — Facebook, Instagram, X/Twitter, TikTok, YouTube, Threads, Bluesky, Pinterest, Google Business Profile, LinkedIn, Mastodon
- **Scheduling** — Schedule posts for any future time with timezone support, or let queue slots pick optimal times
- **Media uploads** — Images (JPEG, PNG, WebP, GIF) and videos (MP4, MOV, WebM) up to 100 MB
- **Recurring schedules** — Repeat posts daily, weekly, biweekly, or monthly with cron expressions
- **Analytics** — Track impressions, likes, comments, shares, and engagement across all platforms
- **Labels** — Organize posts and media with color-coded labels
- **Bulk operations** — Delete or retry multiple posts in a single request
- **Threads** — Multi-part thread posts for X, Threads, Bluesky, and Mastodon
- **Auto first comment** — Automatically add a comment after publishing on any platform
- **All post types** — Reels, Stories, Carousels, Threads, Shorts, Video — set per-platform via `postTypeOverrides`
- **Per-platform content** — Customize text and options per platform in a single post
- **Platform-specific options** — Instagram collaborators, TikTok privacy, YouTube categories, Pinterest boards, and more

## API Reference

Full interactive API documentation: **[app.bulkpublish.com/docs](https://app.bulkpublish.com/docs)**

### Base URL

```
https://app.bulkpublish.com
```

### Authentication

```
Authorization: Bearer bp_your_key_here
```

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/posts` | Create a post (draft, scheduled, or immediate) |
| `GET` | `/api/posts` | List posts (paginated, filterable by status/date/channel/label) |
| `GET` | `/api/posts/:id` | Get a post with platform statuses and metrics |
| `PUT` | `/api/posts/:id` | Update a draft or scheduled post |
| `DELETE` | `/api/posts/:id` | Delete a post |
| `POST` | `/api/posts/:id/publish` | Publish a draft immediately |
| `POST` | `/api/posts/:id/retry` | Retry failed platforms |
| `POST` | `/api/posts/bulk` | Bulk delete or retry |
| `GET` | `/api/channels` | List connected social media channels |
| `GET` | `/api/channels/:id/health` | Check channel token health |
| `GET` | `/api/channels/:id/options` | Get platform options (Pinterest boards, YouTube playlists, LinkedIn orgs) |
| `GET` | `/api/channels/:id/mentions` | Search users for @mention (X, Bluesky) |
| `POST` | `/api/media` | Upload a media file (multipart) |
| `GET` | `/api/media` | List uploaded media |
| `GET` | `/api/analytics/summary` | Analytics summary for a date range |
| `GET` | `/api/analytics/engagement` | Engagement data grouped by day/week/month |
| `POST` | `/api/schedules` | Create a recurring schedule |
| `GET` | `/api/quotas/usage` | Check current plan limits and usage |

See the [OpenAPI spec](openapi.json) for the complete endpoint list.

## Supported Platforms

| Platform | Post Types | Media |
|----------|-----------|-------|
| **Facebook** | Post, Story | Images, Videos |
| **Instagram** | Feed, Reel, Story, Carousel | Images (JPEG), Videos (MP4, MOV) |
| **X / Twitter** | Tweet, Thread | Images, Videos, GIFs |
| **TikTok** | Video, Photo Slideshow | Videos (MP4, MOV), Images |
| **YouTube** | Video, Short | Videos (MP4, MOV, WebM, AVI, WMV, FLV) |
| **Threads** | Post, Thread, Quote Post | Images, Videos |
| **Bluesky** | Post, Thread | Images |
| **Pinterest** | Pin | Images, Videos |
| **Google Business Profile** | Post, Event, Offer | Images |
| **LinkedIn** | Post | Images, Videos |
| **Mastodon** | Post, Thread | Images, Videos |

## SDKs

### Python

```bash
pip install bulkpublish
```

Supports sync and async. Rich docstrings on every method for IDE and LLM consumption.

### Node.js / TypeScript

```bash
npm install bulkpublish
```

Full TypeScript types, zero dependencies, native `fetch` (Node 18+).

### Homebrew (macOS/Linux)

```bash
brew tap azeemkafridi/bulkpublish && brew install bulkpublish
```

Installs the Node SDK via Homebrew.

### REST API

No SDK needed — any HTTP client works:

```bash
curl https://app.bulkpublish.com/api/channels \
  -H "Authorization: Bearer bp_your_key_here"
```

## Rate Limits

| Limit | Free | Pro | Business |
|-------|------|-----|----------|
| Writes/min | 60 | 60 | 60 |
| Reads/min | 300 | 300 | 300 |
| Daily API requests | 100 | 5,000 | 50,000 |
| API keys | 1 | 5 | 10 |

| Recurring schedules | — | 10 | Unlimited |

See the [rate limits guide](guides/rate-limits.md) for headers, backoff strategies, and best practices.

## Guides

- [Authentication](guides/authentication.md) — API keys, authorization, key management
- [Scheduling](guides/scheduling.md) — Scheduled posts, queue slots, recurring schedules, timezones
- [Media Uploads](guides/media-uploads.md) — File uploads, supported formats, using media in posts
- [Platform Options](guides/platforms.md) — Per-platform configuration and quirks
- [Rate Limits](guides/rate-limits.md) — Burst limits, daily quotas, best practices

## Integrations

| Platform | Package | Install |
|----------|---------|---------|
| **n8n** | [n8n-nodes-bulkpublish](https://github.com/azeemkafridi/n8n-nodes-bulkpublish) | Settings > Community Nodes > `n8n-nodes-bulkpublish` |
| **Homebrew** | [homebrew-bulkpublish](https://github.com/azeemkafridi/homebrew-bulkpublish) | `brew tap azeemkafridi/bulkpublish && brew install bulkpublish` |

## Links

| Resource | URL |
|----------|-----|
| Dashboard | [app.bulkpublish.com](https://app.bulkpublish.com) |
| API Docs | [app.bulkpublish.com/docs](https://app.bulkpublish.com/docs) |
| Website | [bulkpublish.com](https://www.bulkpublish.com) |
| Email | support@bulkpublish.com |

## License

MIT
