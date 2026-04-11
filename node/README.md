# BulkPublish Node.js SDK

Official TypeScript/Node.js SDK for the [BulkPublish](https://bulkpublish.com) social media API. Automate publishing to 11 platforms — built for developers, scripts, AI agents, LLMs, and agentic workflows.

## Installation

```bash
npm install bulkpublish
```

Requires Node.js 18+. Zero dependencies — uses native `fetch`.

## Quick Start

```typescript
import { BulkPublish } from 'bulkpublish';

const bp = new BulkPublish({ apiKey: 'bp_your_key_here' });

// List connected social media channels
const { channels } = await bp.channels.list();

// Upload media
const { file } = await bp.media.upload('./photo.jpg');

// Schedule a post to multiple platforms
const post = await bp.posts.create({
  content: 'Hello from the BulkPublish API!',
  channels: [
    { channelId: channels[0].id, platform: channels[0].platform },
    { channelId: channels[1].id, platform: channels[1].platform },
  ],
  mediaFiles: [file.id],
  scheduledAt: '2026-04-10T09:00:00Z',
  timezone: 'America/New_York',
  status: 'scheduled',
});
```

### Post Type Overrides

```typescript
// Post a reel to Instagram
const post = await bp.posts.create({
  content: 'Check this out!',
  channels: [{ channelId: 1, platform: 'instagram' }],
  mediaFiles: [mediaId],
  postTypeOverrides: { instagram: 'reel' },
});
```

## Built for Automation

BulkPublish is designed for programmatic social media management — no browser sessions, no UI, no OAuth flows at runtime. Connect your accounts once in the dashboard, then automate everything:

- **AI agents** — Use with Claude (MCP server), GPT (function calling), LangChain, or any LLM with tool use
- **Server-side scripts** — Cron jobs, CI/CD pipelines, content syndication
- **Bulk operations** — Iterate over data and schedule hundreds of posts programmatically
- **Analytics pipelines** — Pull engagement data into your own dashboards or AI analysis

## Full TypeScript Types

Every request and response is fully typed. Works great with IDE autocomplete and LLM code generation:

```typescript
import type { Post, Channel, CreatePostParams } from 'bulkpublish';
```

## Available Resources

| Resource | Methods |
|----------|---------|
| `bp.posts` | `create`, `list`, `get`, `update`, `delete`, `publish`, `retry`, `bulk`, `queueSlot`, `metrics`, `story` |
| `bp.channels` | `list`, `get`, `delete`, `health` |
| `bp.media` | `upload`, `list`, `get`, `delete` |
| `bp.analytics` | `summary`, `engagement`, `refresh`, `account` |
| `bp.labels` | `list`, `create`, `update`, `delete` |
| `bp.schedules` | `list`, `create`, `update`, `delete` |

## Platform Requirements

| Platform | Post Types | Media | Required Fields | Char Limit |
|---|---|---|---|---|
| Facebook | `post`, `reel`, `story` | Optional (reel/story need media) | — | 63,206 |
| Instagram | `feed_photo`, `feed_video`, `reel`, `story`, `carousel` | Required (type-specific) | — | 2,200 |
| X / Twitter | `tweet` | Optional (max 4 images or 1 video) | — | 280 |
| YouTube | `video`, `short` | **Video required** | **`platformSpecific.youtube.title`** | 5,000 |
| TikTok | `video`, `photo_slideshow` | **Video or images required** | — | 2,200 |
| LinkedIn | `post`, `multi_image`, `pdf_carousel`, `article` | Varies by type | `url` for article | 3,000 |
| Pinterest | `pin`, `video_pin`, `carousel` | **Required** | **`platformSpecific.pinterest.title`** | 500 |
| Threads | `text`, `image`, `video`, `carousel` | Optional | — | 500 |
| Bluesky | `post` | Optional (max 4 images or 1 video) | — | 300 |
| GMB | `standard`, `event`, `offer` | Optional (image only) | dates for event | 1,500 |
| Mastodon | `post` | Optional (max 4 images or 1 video) | — | 500 |

**Important:**
- YouTube and TikTok **only accept video** — do not include them for image-only posts
- Instagram defaults to `feed_photo` — set `postTypeOverrides` for video content
- Use `platformContent` for shorter text on low-limit platforms (Bluesky 300, Pinterest 500)

## Resources

- [Full API Reference](https://app.bulkpublish.com/docs)
- [Guides & Examples](https://github.com/azeemkafridi/bulkpublish-api)
- [AI Agent Examples](https://github.com/azeemkafridi/bulkpublish-api/tree/main/examples/ai-agents) — Claude, GPT, LangChain
- [MCP Server](https://github.com/azeemkafridi/bulkpublish-api/tree/main/mcp-server) — For Claude Desktop, Claude Code, Cursor
- [Get an API Key](https://app.bulkpublish.com/settings/developer)

## License

MIT
