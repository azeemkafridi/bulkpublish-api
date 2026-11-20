# Authentication

BulkPublish uses API keys for authentication. Every API request must include a valid key in the `Authorization` header.

## Getting an API Key

1. Log in to your dashboard at [app.bulkpublish.com](https://app.bulkpublish.com)
2. Go to the **API** page
3. Click **Generate New Key**
4. Give it a name (e.g., "Production", "CI/CD", "Testing")
5. Choose its **Access**: **Full access** or **Read-only** (see [Access levels](#access-levels))
6. Choose when it expires
7. Copy the key immediately -- it is shown only once and cannot be retrieved later

Keys are created and revoked in the app only. An API key cannot create or revoke keys, so a leaked key can never mint itself a replacement.

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

## Access levels

Every key has one of two access levels, chosen when it is created and shown in the key list:

| Access | What it can do |
|--------|----------------|
| **Full access** (default) | Anything its owner's team role allows: create, schedule, publish and delete posts, upload media, reply in the Inbox, manage the account. |
| **Read-only** | Read posts, schedules, labels, templates, media, analytics, quota usage, channels and the Inbox. Nothing else. |

Use a read-only key for reporting, dashboards, spreadsheets and AI agents that should only look. Keys made before access levels existed are full access.

A read-only key that tries to change something gets:

```json
{
  "error": {
    "message": "This API key is read-only and cannot make changes (needs the \"posts:write\" scope)",
    "code": "INSUFFICIENT_SCOPE",
    "required": "posts:write",
    "granted": ["posts:read", "media:read", "analytics:read", "channels:read", "inbox:read"]
  }
}
```

**Status code:** `403`

Account administration (team, organizations, billing, API keys, webhooks) answers `403` with code `FORBIDDEN` for a read-only key, even to read. A read-only key reaches exactly what an OAuth token holding every `:read` scope reaches.

To check before trying a write, read `capabilities` from `GET /api/channels`: `canCreatePosts`, `canPublishPosts` and `canApprovePosts` are all `false` for a read-only key.

## Key Expiration

When creating a key you choose 30 days, 90 days, 1 year or never. A key set to never expire remains valid until it is revoked.

Expired keys return `401 Unauthorized` on every request. The key's `expiresAt` is checked on each API call -- there is no grace period.

## Key Rotation

To rotate a key without downtime:

1. Create a new key in the dashboard
2. Update your application to use the new key
3. Verify the new key works
4. Revoke the old key

Both keys will work simultaneously during the transition period.

## Revoking Keys

Revoke a key from the **API** page in the app: click **Revoke** next to it. The key's creator or a team admin can revoke it.

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
| Free | 10 |
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

## Team Roles and API Keys

An API key inherits the role of the member who created it. Roles with `post:publish` (owner, admin, approver) can publish directly; keys belonging to members whose role lacks `post:publish` (contributors) always have `requestApproval` forced on when scheduling — their posts get `approvalStatus` `"pending"` — and `POST /api/posts/:id/publish` returns `403` with code `APPROVAL_REQUIRED`. Roles with `post:approve` (owner, admin, approver) can call `POST /api/posts/:id/approve` and `/reject`. Contributor keys also have `requireApproval` forced on for recurring schedules and RSS feeds, on create and on every update. See the scheduling guide's "Team Approval Flow" section.

The rest of the API follows the same roles. A **viewer** key can read but cannot write anything: posts, media, labels, templates, hashtag groups, calendar notes, channel sets, schedules and feeds all answer `403 FORBIDDEN`. A **contributor** key writes content but cannot connect, disconnect or reconfigure a channel. Billing — the customer portal and the credit and channel-slot checkouts — is the **workspace owner** only. Each endpoint's own description names the roles it accepts.

## Security Best Practices

- Never commit API keys to version control
- Use environment variables to store keys
- Set expiration dates on keys, especially for CI/CD or temporary access
- Give a key **Read-only** access when it only needs to read, such as for reports, dashboards and agents that should not post
- Use separate keys for development and production
- Revoke keys immediately if they may have been exposed
- Monitor key usage on the **API** page in the app
