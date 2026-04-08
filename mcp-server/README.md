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

## Available Tools

| Tool | Description |
|------|-------------|
| `list_channels` | List all connected social media channels |
| `create_post` | Create and optionally schedule a post |
| `list_posts` | List posts with filters (status, search, date range) |
| `get_post` | Get a single post with full details |
| `publish_post` | Publish a draft post immediately |
| `retry_post` | Retry a failed post |
| `upload_media` | Upload a media file from a URL |
| `list_media` | List uploaded media files |
| `get_analytics` | Get analytics summary for a date range |
| `list_labels` | List all labels |
| `create_label` | Create a new label |
| `get_quota_usage` | Check current plan quota usage |

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
