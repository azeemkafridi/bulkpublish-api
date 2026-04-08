# Webhooks

Webhooks let you receive real-time notifications when events happen in BulkPublish. Instead of polling the API, your server receives an HTTP POST request whenever a post is published, fails, or is scheduled.

## Availability

| Plan | Webhooks |
|------|----------|
| Free | Not available |
| Pro | 5 |
| Business | 10 |

## Creating a Webhook

```bash
curl -X POST https://app.bulkpublish.com/api/webhooks \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-server.com/webhooks/bulkpublish",
    "events": ["post.published", "post.failed"]
  }'
```

**Python**

```python
webhook = client.webhooks.create(
    url="https://your-server.com/webhooks/bulkpublish",
    events=["post.published", "post.failed"],
)

# Save the secret -- it's only shown on creation
print(webhook["secret"])
```

**Node.js**

```javascript
const webhook = await client.webhooks.create({
  url: "https://your-server.com/webhooks/bulkpublish",
  events: ["post.published", "post.failed"],
});

// Save the secret -- it's only shown on creation
console.log(webhook.secret);
```

### Response

```json
{
  "id": 7,
  "url": "https://your-server.com/webhooks/bulkpublish",
  "events": ["post.published", "post.failed"],
  "secret": "a1b2c3d4e5f6...",
  "createdAt": "2026-04-08T12:00:00.000Z"
}
```

The `secret` is returned only on creation. Save it securely -- you'll need it to verify webhook signatures.

### Custom Secret

You can provide your own secret instead of using the auto-generated one:

```json
{
  "url": "https://your-server.com/webhooks/bulkpublish",
  "events": ["post.published"],
  "secret": "my-custom-webhook-secret"
}
```

## Events

| Event | Description |
|-------|-------------|
| `post.published` | A post was successfully published to one or more platforms |
| `post.failed` | A post failed to publish on one or more platforms |
| `post.scheduled` | A post was created with scheduled status |

Subscribe to any combination of events when creating the webhook.

## Payload Format

Each webhook delivery sends a JSON POST request to your URL. The payload includes the event type and relevant data:

### post.published

```json
{
  "event": "post.published",
  "timestamp": "2026-04-08T12:05:00.000Z",
  "data": {
    "postId": 123,
    "content": "Hello world!",
    "platforms": [
      {
        "platform": "x",
        "channelId": 1,
        "status": "published",
        "postId": "1234567890",
        "url": "https://x.com/user/status/1234567890"
      },
      {
        "platform": "linkedin",
        "channelId": 2,
        "status": "published",
        "postId": "urn:li:share:987654321"
      }
    ]
  }
}
```

### post.failed

```json
{
  "event": "post.failed",
  "timestamp": "2026-04-08T12:05:00.000Z",
  "data": {
    "postId": 124,
    "content": "This post failed.",
    "platforms": [
      {
        "platform": "instagram",
        "channelId": 3,
        "status": "failed",
        "error": "Invalid media: image exceeds maximum dimensions"
      }
    ]
  }
}
```

## Webhook Secrets and Signature Verification

Every webhook delivery includes a signature in the `X-BulkPublish-Signature` header. Use it to verify the request came from BulkPublish and was not tampered with.

The signature is an HMAC-SHA256 hash of the request body, computed using your webhook secret.

### Verification Examples

**Node.js**

```javascript
import crypto from "crypto";

function verifyWebhookSignature(body, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

// In your webhook handler:
app.post("/webhooks/bulkpublish", (req, res) => {
  const signature = req.headers["x-bulkpublish-signature"];
  const body = req.rawBody; // Raw request body as string

  if (!verifyWebhookSignature(body, signature, WEBHOOK_SECRET)) {
    return res.status(401).send("Invalid signature");
  }

  const event = JSON.parse(body);
  console.log(`Received ${event.event} for post ${event.data.postId}`);
  res.sendStatus(200);
});
```

**Python**

```python
import hmac
import hashlib

def verify_webhook_signature(body: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, expected)

# In your webhook handler (Flask example):
@app.route("/webhooks/bulkpublish", methods=["POST"])
def handle_webhook():
    signature = request.headers.get("X-BulkPublish-Signature")
    body = request.get_data()

    if not verify_webhook_signature(body, signature, WEBHOOK_SECRET):
        return "Invalid signature", 401

    event = request.json
    print(f"Received {event['event']} for post {event['data']['postId']}")
    return "", 200
```

Always verify signatures in production. Without verification, anyone could send fake webhook payloads to your endpoint.

## Retry Behavior

If your endpoint returns a non-2xx status code or times out, BulkPublish retries the delivery with exponential backoff:

| Attempt | Delay |
|---------|-------|
| 1st retry | 10 seconds |
| 2nd retry | 20 seconds |
| 3rd retry | 40 seconds |
| 4th retry | 80 seconds |
| 5th retry | 160 seconds |

After 5 failed attempts, the delivery is marked as failed and no further retries are made.

### Best Practices for Receiving Webhooks

- **Return 200 quickly.** Process the webhook asynchronously. Return 200 immediately and handle the event in a background job.
- **Handle duplicates.** In rare cases, the same event may be delivered more than once. Use the `postId` and `timestamp` to deduplicate.
- **Use HTTPS.** Always use an HTTPS endpoint for webhooks in production.
- **Set timeouts.** BulkPublish waits up to 30 seconds for your endpoint to respond before marking the delivery as failed and scheduling a retry.

## Managing Webhooks

### List webhooks

```bash
curl https://app.bulkpublish.com/api/webhooks \
  -H "Authorization: Bearer bp_your_key_here"
```

The secret is omitted from list responses for security.

### Update a webhook

```bash
curl -X PUT https://app.bulkpublish.com/api/webhooks/7 \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"events": ["post.published", "post.failed", "post.scheduled"]}'
```

### Delete a webhook

```bash
curl -X DELETE https://app.bulkpublish.com/api/webhooks/7 \
  -H "Authorization: Bearer bp_your_key_here"
```
