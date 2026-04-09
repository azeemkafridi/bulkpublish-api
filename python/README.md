# BulkPublish Python SDK

Official Python SDK for the [BulkPublish](https://bulkpublish.com) social media API. Automate publishing to 11 platforms — built for developers, scripts, AI agents, LLMs, and agentic workflows.

## Installation

```bash
pip install bulkpublish
```

Requires Python 3.8+. Only dependency: `httpx`.

## Quick Start

```python
from bulkpublish import BulkPublish

bp = BulkPublish("bp_your_key_here")

# List connected social media channels
channels = bp.channels.list()

# Upload media
media = bp.media.upload("./photo.jpg")

# Schedule a post to multiple platforms
post = bp.posts.create(
    content="Hello from the BulkPublish API!",
    channels=[
        {"channelId": 1, "platform": "instagram"},
        {"channelId": 2, "platform": "x"},
    ],
    media_files=[media["file"]["id"]],
    scheduled_at="2026-04-10T09:00:00Z",
    timezone="America/New_York",
    status="scheduled",
)
```

### Post Type Overrides

```python
# Post a reel to Instagram
post = bp.posts.create(
    content="Check this out!",
    channels=[{"channelId": 1, "platform": "instagram"}],
    media_files=[media_id],
    post_type_overrides={"instagram": "reel"},
)
```

## Built for Automation

BulkPublish is designed for programmatic social media management — no browser sessions, no UI, no OAuth flows at runtime. Connect your accounts once in the dashboard, then automate everything:

- **AI agents** — Use with Claude (MCP server), GPT (function calling), LangChain, or any LLM that supports tool use
- **Cron jobs & scripts** — Schedule content pipelines, RSS-to-social, blog-to-social workflows
- **Bulk operations** — Upload a CSV, iterate, and schedule hundreds of posts programmatically
- **Analytics extraction** — Pull engagement data into your own dashboards or AI analysis pipelines

## Async Support

```python
import asyncio
from bulkpublish import AsyncBulkPublish

async def main():
    bp = AsyncBulkPublish("bp_your_key_here")
    channels = await bp.channels.list()
    post = await bp.posts.create(
        content="Async post!",
        channels=[{"channelId": 1, "platform": "x"}],
        status="draft",
    )

asyncio.run(main())
```

## Available Resources

| Resource | Methods |
|----------|---------|
| `bp.posts` | `create`, `list`, `get`, `update`, `delete`, `publish`, `retry`, `bulk`, `queue_slot` |
| `bp.channels` | `list`, `get`, `delete`, `health` |
| `bp.media` | `upload`, `list`, `get`, `delete` |
| `bp.analytics` | `summary`, `engagement`, `refresh`, `account` |
| `bp.labels` | `list`, `create`, `update`, `delete` |
| `bp.schedules` | `list`, `create`, `update`, `delete` |

Every method has docstrings with usage examples — works great with IDE autocomplete and LLM code generation.

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
