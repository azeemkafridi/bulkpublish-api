# Rate Limits

BulkPublish enforces rate limits to ensure fair usage and platform stability.

## Per-Minute Burst Limits

| Operation | Limit |
|-----------|-------|
| Write requests (POST, PUT, DELETE) | 60/minute |
| Read requests (GET) | 300/minute |

## Daily API Quota

Your daily quota depends on your plan:

| Plan | Daily API Requests |
|------|-------------------|
| Free | 100 |
| Pro | 5,000 |
| Business | Unlimited |

The daily quota resets at midnight UTC.

## Rate Limit Headers

Every API response includes these headers:

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 58
X-RateLimit-Reset: 1712678400
```

When you exceed the limit, you'll receive a `429 Too Many Requests` response:

```json
{
  "error": {
    "message": "Rate limit exceeded",
    "code": "RATE_LIMITED"
  }
}
```

## Best Practices

1. **Check remaining quota** — read the `X-RateLimit-Remaining` header
2. **Use exponential backoff** — on 429 responses, wait and retry with increasing delays
3. **Batch operations** — use `POST /api/posts/bulk` instead of individual delete/retry calls
4. **Cache channel lists** — channels rarely change, cache `GET /api/channels` for a few minutes
5. **Use efficient polling** — check post status at reasonable intervals rather than hammering the API

## SDK Handling

Both SDKs automatically raise a specific error for rate limits:

```python
from bulkpublish import BulkPublish, RateLimitError

bp = BulkPublish("bp_your_key_here")

try:
    post = bp.posts.create(content="Hello!", channels=[...])
except RateLimitError as e:
    print(f"Rate limited. Retry after {e.retry_after} seconds")
```

```typescript
import { BulkPublish, RateLimitError } from 'bulkpublish';

try {
  await bp.posts.create({ content: 'Hello!', channels: [...] });
} catch (e) {
  if (e instanceof RateLimitError) {
    console.log(`Rate limited. Retry after ${e.retryAfter}s`);
  }
}
```
