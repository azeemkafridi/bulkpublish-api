# Authentication

BulkPublish uses API keys for authentication. Every API request must include a valid key in the `Authorization` header.

## Getting an API Key

1. Log in to your dashboard at [app.bulkpublish.com](https://app.bulkpublish.com)
2. Go to **Settings > Developer**
3. Click **Create API Key**
4. Give it a name (e.g., "Production", "CI/CD", "Testing")
5. Optionally set an expiration date or number of days until expiry
6. Copy the key immediately -- it is shown only once and cannot be retrieved later

API keys start with the prefix `bp_` followed by 64 hex characters:

```
bp_a1b2c3d4e5f6...
```

## Using Your API Key

Include the key in the `Authorization` header as a Bearer token:

```bash
curl https://app.bulkpublish.com/api/posts \
  -H "Authorization: Bearer bp_your_key_here"
```

**Python**

```python
import requests

headers = {"Authorization": "Bearer bp_your_key_here"}
response = requests.get("https://app.bulkpublish.com/api/posts", headers=headers)
```

**Node.js**

```javascript
const response = await fetch("https://app.bulkpublish.com/api/posts", {
  headers: { Authorization: "Bearer bp_your_key_here" },
});
```

If the key is missing, invalid, expired, or revoked, the API returns:

```json
{
  "error": {
    "message": "Unauthorized",
    "code": "UNAUTHORIZED"
  }
}
```

**Status code:** `401`

## Key Expiration

When creating a key, you can set expiration in two ways:

- **Specific date**: Pass `expiresAt` as an ISO 8601 date string
- **Days from now**: Pass `expires_in_days` as a number

```bash
curl -X POST https://app.bulkpublish.com/api/api-keys \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"name": "Short-lived key", "expires_in_days": 30}'
```

If neither is set, the key has no expiration and remains valid until manually revoked.

Expired keys return `401 Unauthorized` on every request. The key's `expiresAt` is checked on each API call -- there is no grace period.

## Key Rotation

To rotate a key without downtime:

1. Create a new key in the dashboard
2. Update your application to use the new key
3. Verify the new key works
4. Revoke the old key

Both keys will work simultaneously during the transition period.

## Revoking Keys

To revoke a key, send a DELETE request:

```bash
curl -X DELETE https://app.bulkpublish.com/api/api-keys/KEY_ID \
  -H "Authorization: Bearer bp_your_key_here"
```

You can also revoke keys from the dashboard under **Settings > Developer**.

Revocation is immediate. Any in-flight requests using the revoked key will fail.

## API Key Limits by Plan

| Plan | Max API Keys |
|------|-------------|
| Free | 1 |
| Pro | 5 |
| Business | 10 |

If you try to create a key beyond your plan's limit, the API returns:

```json
{
  "error": {
    "message": "API key quota exceeded",
    "code": "QUOTA_EXCEEDED"
  }
}
```

## Daily API Request Quotas

Each plan has a daily API request limit, enforced per organization and reset at midnight UTC:

| Plan | Daily Requests |
|------|---------------|
| Free | 100 |
| Pro | 5,000 |
| Business | 50,000 |

When exceeded, the API returns `429` with:

```json
{
  "error": {
    "message": "Daily API quota exceeded (101/100). Resets at midnight UTC.",
    "code": "DAILY_QUOTA_EXCEEDED",
    "current": 101,
    "limit": 100,
    "upgrade": true
  }
}
```

Daily quotas only apply to API key requests. Requests made through the dashboard UI (session auth) are not counted against this limit.

## Security Best Practices

- Never commit API keys to version control
- Use environment variables to store keys
- Set expiration dates on keys, especially for CI/CD or temporary access
- Use separate keys for development and production
- Revoke keys immediately if they may have been exposed
- Monitor key usage in the dashboard under **Settings > Developer**
