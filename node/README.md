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

## Supported Platforms

Facebook, Instagram, X (Twitter), TikTok, YouTube, Threads, Bluesky, Pinterest, Google Business Profile, LinkedIn, Mastodon

## Resources

- [Full API Reference](https://app.bulkpublish.com/docs)
- [Guides & Examples](https://github.com/azeemkafridi/bulkpublish-api)
- [AI Agent Examples](https://github.com/azeemkafridi/bulkpublish-api/tree/main/examples/ai-agents) — Claude, GPT, LangChain
- [MCP Server](https://github.com/azeemkafridi/bulkpublish-api/tree/main/mcp-server) — For Claude Desktop, Claude Code, Cursor
- [Get an API Key](https://app.bulkpublish.com/settings/developer)

## License

MIT
