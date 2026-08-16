# BulkPublish

Cursor plugin that connects agents to [BulkPublish](https://www.bulkpublish.com) through BulkPublish's official remote [Model Context Protocol](https://modelcontextprotocol.io/) server.

Draft a post once and tailor it per platform, find the next open slot in your posting queue and schedule to it, attach media, retry a post that failed, and read engagement metrics for what has already gone out — all against your own connected accounts.

## Install

1. Open **Cursor Settings → Plugins**.
2. Search for **BulkPublish**.
3. Click **Install**, then complete the BulkPublish sign-in prompt.

Or run `/add-plugin bulkpublish` in chat.

A BulkPublish account is required. Sign up at [app.bulkpublish.com](https://app.bulkpublish.com).

## MCP

```json
{
  "mcpServers": {
    "bulkpublish": {
      "type": "http",
      "url": "https://mcp.bulkpublish.com/mcp"
    }
  }
}
```

Auth is OAuth 2.1 with Dynamic Client Registration (DCR) and PKCE (S256). Cursor registers itself and prompts for BulkPublish authorization when the plugin connects — there is no client ID to configure. The consent screen asks for a BulkPublish API key, which you can create at [app.bulkpublish.com/developer](https://app.bulkpublish.com/developer); it is stored only inside an encrypted token scoped to this connection.

## Platforms

Fourteen platforms are supported: X, Instagram, LinkedIn, Facebook, TikTok, YouTube, Pinterest, Threads, Bluesky, Mastodon, Discord, Telegram, Tumblr, and Google Business.

## Skills

The plugin ships six reference skills the agent consults automatically:

| Skill | Use |
| --- | --- |
| `platform-reference` | Per-platform post types, media specs, character limits, and `platformSpecific` options |
| `schedule-post` | Creating, scheduling, and publishing posts |
| `bulk-publish` | Media uploads and batch post creation |
| `manage-channels` | Listing connected channels and checking their health |
| `get-analytics` | Engagement metrics and performance data |
| `check-quota` | Plan limits and current usage |

## Notes

- Tool calls run as the BulkPublish user who authorizes the connection and cannot exceed that user's permissions or reach another organization's data.
- Tools that publish to a third-party platform (`publish_post`, `publish_story`, `retry_post`, `approve_post`, and the `retry` action of `bulk_posts`) are annotated `openWorldHint`. Tools that permanently remove data (`delete_post`, `delete_media`, `delete_label`, `delete_schedule`, `delete_channel_set`, `delete_rss_feed`, `bulk_posts`) are annotated `destructiveHint`.
- `create_post` never publishes on the spot — it only saves a draft or a scheduled post.

## Docs

- API reference: https://app.bulkpublish.com/docs
- MCP server URL: https://mcp.bulkpublish.com/mcp
- Support: https://help.bulkpublish.com
