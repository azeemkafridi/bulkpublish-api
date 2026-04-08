#!/usr/bin/env bash
#
# BulkPublish API — curl Quick Reference
# =======================================
#
# Every API endpoint as a curl command with explanations.
#
# Prerequisites:
#   export BULKPUBLISH_API_KEY=bp_your_key
#
# Base URL: https://app.bulkpublish.com
# Auth: Bearer token in Authorization header
#

set -euo pipefail

BASE="${BULKPUBLISH_BASE_URL:-https://app.bulkpublish.com}"
API_KEY="${BULKPUBLISH_API_KEY:?Set the BULKPUBLISH_API_KEY environment variable}"
AUTH="Authorization: Bearer $API_KEY"

echo "BulkPublish API — curl Quick Reference"
echo "======================================="
echo "Base URL: $BASE"
echo ""

# ── Channels ──────────────────────────────────────────────────────────────────

# List all active channels
# Returns: { channels: [{ id, platform, accountName, tokenStatus, ... }] }
curl -s -H "$AUTH" "$BASE/api/channels"

# List all channels including inactive
curl -s -H "$AUTH" "$BASE/api/channels?active=false"

# Get a specific channel by ID
curl -s -H "$AUTH" "$BASE/api/channels/1"

# Check channel health (token validity)
curl -s -H "$AUTH" "$BASE/api/channels/1/health"

# ── Posts ─────────────────────────────────────────────────────────────────────

# List posts (paginated, default 20 per page)
# Filters: status, search, page, limit, channelId, labelId, from, to,
#          scheduledFrom, scheduledTo, labelIds, labelMode (or|and), recurring
curl -s -H "$AUTH" "$BASE/api/posts"

# List published posts, page 1, 10 per page
curl -s -H "$AUTH" "$BASE/api/posts?status=published&page=1&limit=10"

# Search posts by content text
curl -s -H "$AUTH" "$BASE/api/posts?search=launch"

# Filter by creation date range
curl -s -H "$AUTH" "$BASE/api/posts?from=2025-01-01&to=2025-01-31"

# Filter by scheduled date range
curl -s -H "$AUTH" "$BASE/api/posts?scheduledFrom=2025-01-13&scheduledTo=2025-01-19"

# Filter by channel
curl -s -H "$AUTH" "$BASE/api/posts?channelId=1"

# Filter by single label
curl -s -H "$AUTH" "$BASE/api/posts?labelId=5"

# Filter by multiple labels (OR mode — any matching label)
curl -s -H "$AUTH" "$BASE/api/posts?labelIds=1,2,3&labelMode=or"

# Filter by multiple labels (AND mode — must have all labels)
curl -s -H "$AUTH" "$BASE/api/posts?labelIds=1,2,3&labelMode=and"

# Get a single post with full details (platforms, labels, media, metrics)
curl -s -H "$AUTH" "$BASE/api/posts/42"

# Create a draft post
# Required: content, channels (array of {channelId, platform})
# Optional: mediaFiles, labels, platformSpecific, platformContent,
#          postFormat, threadParts, deleteMediaAfterPublish
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "content": "Hello from the API!",
    "channels": [{"channelId": 1, "platform": "x"}],
    "status": "draft"
  }' "$BASE/api/posts"

# Create a scheduled post to multiple platforms
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "content": "Scheduled post from the API!",
    "channels": [
      {"channelId": 1, "platform": "x"},
      {"channelId": 2, "platform": "linkedin"}
    ],
    "status": "scheduled",
    "scheduledAt": "2025-02-01T14:00:00Z",
    "timezone": "America/New_York"
  }' "$BASE/api/posts"

# Create a post with platform-specific content overrides
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "content": "Check out our latest update!",
    "channels": [
      {"channelId": 1, "platform": "x"},
      {"channelId": 2, "platform": "linkedin"}
    ],
    "status": "draft",
    "platformContent": {
      "x": "New update! Check it out",
      "linkedin": "Excited to share our latest product update. Here is what changed..."
    }
  }' "$BASE/api/posts"

# Create a post with media attachments
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "content": "Look at this!",
    "channels": [{"channelId": 1, "platform": "instagram"}],
    "status": "draft",
    "mediaFiles": [15],
    "platformSpecific": {
      "instagram": {"postType": "feed"}
    }
  }' "$BASE/api/posts"

# Create a thread post (X/Twitter threads, etc.)
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "content": "Thread: 3 tips for better engagement",
    "channels": [{"channelId": 1, "platform": "x"}],
    "status": "draft",
    "postFormat": "thread",
    "threadParts": [
      {"content": "Thread: 3 tips for better engagement (1/3)"},
      {"content": "Tip 1: Post consistently at the same time each day. (2/3)"},
      {"content": "Tip 2: Always reply to comments within the first hour. (3/3)"}
    ]
  }' "$BASE/api/posts"

# Update a post (draft/scheduled/failed only)
curl -s -X PUT -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "content": "Updated content",
    "scheduledAt": "2025-02-02T10:00:00Z"
  }' "$BASE/api/posts/42"

# Publish a draft post immediately
curl -s -X POST -H "$AUTH" "$BASE/api/posts/42/publish"

# Retry failed platforms on a post
curl -s -X POST -H "$AUTH" "$BASE/api/posts/42/retry"

# Get post metrics (impressions, likes, comments, shares)
curl -s -H "$AUTH" "$BASE/api/posts/42/metrics"

# Delete a post
curl -s -X DELETE -H "$AUTH" "$BASE/api/posts/42"

# Bulk actions on posts (delete, publish)
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"action": "delete", "postIds": [1, 2, 3]}' "$BASE/api/posts/bulk"

# Get next optimal queue slot for a channel
curl -s -H "$AUTH" "$BASE/api/posts/queue-slot?channelId=1"

# ── Media ─────────────────────────────────────────────────────────────────────

# Upload a media file (multipart/form-data)
# Supported: JPEG, PNG, WebP, GIF, MP4, MOV, WebM (max 100MB)
curl -s -X POST -H "Authorization: Bearer $API_KEY" \
  -F "file=@./photo.jpg" "$BASE/api/media"

# List media files (paginated)
# Optional: search (filename), page, limit, labelIds
curl -s -H "$AUTH" "$BASE/api/media"
curl -s -H "$AUTH" "$BASE/api/media?search=logo&page=1&limit=10"

# Get a single media file by ID
curl -s -H "$AUTH" "$BASE/api/media/15"

# Delete a media file
curl -s -X DELETE -H "$AUTH" "$BASE/api/media/15"

# ── Analytics ─────────────────────────────────────────────────────────────────

# Get analytics summary for a date range
# Returns: totalPosts, published, failed, scheduled, byPlatform, byDay
curl -s -H "$AUTH" "$BASE/api/analytics/summary?from=2025-01-01&to=2025-01-31"

# Get engagement data grouped by day
curl -s -H "$AUTH" "$BASE/api/analytics/engagement?groupBy=day&from=2025-01-01&to=2025-01-31"

# Refresh analytics from platforms (trigger re-sync)
curl -s -X POST -H "$AUTH" "$BASE/api/analytics/refresh"

# ── Labels ────────────────────────────────────────────────────────────────────

# List all labels (both post and media)
curl -s -H "$AUTH" "$BASE/api/labels"

# List only post labels
curl -s -H "$AUTH" "$BASE/api/labels?type=post"

# List only media labels
curl -s -H "$AUTH" "$BASE/api/labels?type=media"

# Create a label
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{"name": "Campaign Q2", "color": "#3b82f6", "type": "post"}' "$BASE/api/labels"

# ── Schedules ─────────────────────────────────────────────────────────────────

# List recurring schedules
curl -s -H "$AUTH" "$BASE/api/schedules"

# ── Webhooks ──────────────────────────────────────────────────────────────────

# List webhooks
curl -s -H "$AUTH" "$BASE/api/webhooks"

# Create a webhook
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/bulkpublish",
    "events": ["post.published", "post.failed"]
  }' "$BASE/api/webhooks"

# ── Quotas & Usage ────────────────────────────────────────────────────────────

# Check quota usage (daily/monthly limits, storage, channels)
curl -s -H "$AUTH" "$BASE/api/quotas/usage"

# Check API key usage history
curl -s -H "$AUTH" "$BASE/api/api-keys/usage"
