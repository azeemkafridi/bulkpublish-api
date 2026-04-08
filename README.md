# BulkPublish API

**The best free social media publishing and scheduling API.**

Publish to 11 platforms from a single API call. Schedule posts, upload media, track analytics, and automate your social media workflow.

```python
import bulkpublish

client = bulkpublish.Client("bp_your_key_here")
client.posts.create(
    content="Launching our new product today!",
    channels=[{"channelId": 1, "platform": "x"}, {"channelId": 2, "platform": "linkedin"}],
    status="scheduled",
    scheduledAt="2026-04-10T09:00:00Z"
)
```

---

## Features

- **11 platforms** -- Facebook, Instagram, X/Twitter, TikTok, YouTube, Threads, Bluesky, Pinterest, Google Business Profile, LinkedIn, Mastodon
- **Scheduling** -- Schedule posts for any future time with timezone support, or let queue slots pick optimal times
- **Media uploads** -- Images (JPEG, PNG, WebP, GIF) and videos (MP4, MOV, WebM) up to 100 MB
- **Recurring schedules** -- Repeat posts daily, weekly, biweekly, or monthly with cron-like control
- **Analytics** -- Track impressions, likes, comments, shares, and engagement across all platforms
- **Webhooks** -- Get notified when posts are published, fail, or are scheduled
- **Labels** -- Organize posts and media with color-coded labels
- **Bulk operations** -- Create multiple posts in a single request
- **Threads** -- Multi-part thread posts for X, Threads, Bluesky, and Mastodon
- **Auto first comment** -- Automatically add a comment after publishing on any platform
- **Per-platform content** -- Customize text and options per platform in a single post
- **Platform-specific options** -- Instagram collaborators, TikTok privacy, YouTube categories, Pinterest boards, and more

## Quick Start

### 1. Sign up

Create a free account at [app.bulkpublish.com](https://app.bulkpublish.com/register).

### 2. Get your API key

Go to **Settings > Developer** in the dashboard and create an API key. Keys start with `bp_` and are shown only once -- save it securely.

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

Or call the REST API directly with any HTTP client.

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

## Code Examples

### Create a Post

**Python**

```python
import bulkpublish

client = bulkpublish.Client("bp_your_key_here")

post = client.posts.create(
    content="Check out our latest blog post!",
    channels=[
        {"channelId": 1, "platform": "facebook"},
        {"channelId": 2, "platform": "x"},
        {"channelId": 3, "platform": "linkedin"},
    ],
    status="draft",
)

print(post["id"])
```

**Node.js**

```javascript
import BulkPublish from "bulkpublish";

const client = new BulkPublish("bp_your_key_here");

const post = await client.posts.create({
  content: "Check out our latest blog post!",
  channels: [
    { channelId: 1, platform: "facebook" },
    { channelId: 2, platform: "x" },
    { channelId: 3, platform: "linkedin" },
  ],
  status: "draft",
});

console.log(post.id);
```

### Schedule a Post

**Python**

```python
post = client.posts.create(
    content="This will go out tomorrow morning.",
    channels=[{"channelId": 1, "platform": "instagram"}],
    status="scheduled",
    scheduledAt="2026-04-10T09:00:00Z",
    timezone="America/New_York",
)
```

**Node.js**

```javascript
const post = await client.posts.create({
  content: "This will go out tomorrow morning.",
  channels: [{ channelId: 1, platform: "instagram" }],
  status: "scheduled",
  scheduledAt: "2026-04-10T09:00:00Z",
  timezone: "America/New_York",
});
```

### Upload Media and Attach to a Post

**Python**

```python
# Upload a file
media = client.media.upload("product-photo.jpg")

# Use it in a post
post = client.posts.create(
    content="Our newest product is here.",
    channels=[{"channelId": 1, "platform": "instagram"}],
    mediaFiles=[media["file"]["id"]],
    status="scheduled",
    scheduledAt="2026-04-10T12:00:00Z",
)
```

**Node.js**

```javascript
import fs from "fs";

// Upload a file
const media = await client.media.upload(fs.createReadStream("product-photo.jpg"));

// Use it in a post
const post = await client.posts.create({
  content: "Our newest product is here.",
  channels: [{ channelId: 1, platform: "instagram" }],
  mediaFiles: [media.file.id],
  status: "scheduled",
  scheduledAt: "2026-04-10T12:00:00Z",
});
```

### List Connected Channels

**Python**

```python
channels = client.channels.list()

for ch in channels["channels"]:
    print(f"{ch['platform']}: {ch['accountName']} (ID: {ch['id']})")
```

**Node.js**

```javascript
const { channels } = await client.channels.list();

for (const ch of channels) {
  console.log(`${ch.platform}: ${ch.accountName} (ID: ${ch.id})`);
}
```

## API Reference

Full interactive API documentation powered by Scalar:

**[app.bulkpublish.com/docs](https://app.bulkpublish.com/docs)**

### Base URL

```
https://app.bulkpublish.com
```

### Authentication

All requests require an API key in the `Authorization` header:

```
Authorization: Bearer bp_your_key_here
```

### Core Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/posts` | List posts (paginated, filterable) |
| `POST` | `/api/posts` | Create a new post |
| `GET` | `/api/posts/:id` | Get a single post |
| `PUT` | `/api/posts/:id` | Update a post |
| `DELETE` | `/api/posts/:id` | Delete a post |
| `POST` | `/api/posts/:id/publish` | Publish a draft immediately |
| `POST` | `/api/posts/:id/retry` | Retry a failed post |
| `POST` | `/api/posts/bulk` | Create multiple posts |
| `GET` | `/api/channels` | List connected channels |
| `POST` | `/api/media` | Upload a media file |
| `GET` | `/api/media` | List uploaded media |
| `GET` | `/api/media/:id` | Get a media file |
| `DELETE` | `/api/media/:id` | Delete a media file |
| `GET` | `/api/labels` | List labels |
| `POST` | `/api/labels` | Create a label |
| `GET` | `/api/schedules` | List recurring schedules |
| `POST` | `/api/schedules` | Create a recurring schedule |
| `GET` | `/api/webhooks` | List webhooks |
| `POST` | `/api/webhooks` | Create a webhook |
| `GET` | `/api/analytics/summary` | Get analytics summary |
| `GET` | `/api/analytics/engagement` | Get engagement data |

## Supported Platforms

| Platform | Post Types | Media |
|----------|-----------|-------|
| **Facebook** | Post, Story | Images, Videos |
| **Instagram** | Feed Photo, Feed Video, Reel, Story, Carousel | Images (JPEG), Videos (MP4, MOV) |
| **X / Twitter** | Tweet, Thread | Images, Videos, GIFs |
| **TikTok** | Video, Photo Slideshow | Videos (MP4, MOV), Images (JPEG, WebP) |
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

```python
import bulkpublish

client = bulkpublish.Client("bp_your_key_here")

# All resources available as client.posts, client.channels, client.media, etc.
posts = client.posts.list(status="published", limit=10)
```

### Node.js

```bash
npm install bulkpublish
```

```javascript
import BulkPublish from "bulkpublish";

const client = new BulkPublish("bp_your_key_here");

// All resources available as client.posts, client.channels, client.media, etc.
const posts = await client.posts.list({ status: "published", limit: 10 });
```

### Direct HTTP

No SDK needed. Use `curl`, `fetch`, `requests`, or any HTTP client:

```bash
curl https://app.bulkpublish.com/api/channels \
  -H "Authorization: Bearer bp_your_key_here"
```

## MCP Server

BulkPublish provides an MCP (Model Context Protocol) server for integration with Claude, AI agents, and other MCP-compatible tools.

```json
{
  "mcpServers": {
    "bulkpublish": {
      "command": "npx",
      "args": ["-y", "bulkpublish-mcp"],
      "env": {
        "BULKPUBLISH_API_KEY": "bp_your_key_here"
      }
    }
  }
}
```

This allows AI agents to:
- Create and schedule posts across all platforms
- Upload and manage media
- Query post analytics and status
- Manage channels, labels, and webhooks

## Rate Limits

| Limit Type | Free | Pro | Business |
|-----------|------|-----|----------|
| Writes per minute | 60 | 60 | 60 |
| Reads per minute | 300 | 300 | 300 |
| Daily API requests | 100 | 5,000 | 50,000 |
| API keys | 1 | 5 | 10 |
| Webhooks | -- | 5 | 10 |
| Recurring schedules | -- | 10 | Unlimited |

Rate limit headers are included in every response:

```
Retry-After: 12
```

When you hit a limit, you'll receive a `429 Too Many Requests` response. See the [rate limits guide](guides/rate-limits.md) for best practices.

## Guides

- [Authentication](guides/authentication.md) -- API keys, authorization, and key management
- [Scheduling](guides/scheduling.md) -- Scheduled posts, queue slots, recurring schedules
- [Media Uploads](guides/media-uploads.md) -- Uploading files, supported formats, using media in posts
- [Platform-Specific Options](guides/platforms.md) -- Per-platform configuration and quirks
- [Webhooks](guides/webhooks.md) -- Event notifications, payloads, and verification
- [Rate Limits](guides/rate-limits.md) -- Burst limits, daily quotas, and best practices

## Links

| Resource | URL |
|----------|-----|
| Dashboard | [app.bulkpublish.com](https://app.bulkpublish.com) |
| API Docs (Scalar) | [app.bulkpublish.com/docs](https://app.bulkpublish.com/docs) |
| Marketing Site | [bulkpublish.com](https://www.bulkpublish.com) |
| Status | [status.bulkpublish.com](https://status.bulkpublish.com) |
| Email Support | support@bulkpublish.com |

## License

MIT
