/**
 * Webhook Listener
 * ================
 *
 * A simple Express server that receives webhook events from BulkPublish.
 *
 * BulkPublish sends webhooks for events like:
 *   - post.published  — A post was published to a platform
 *   - post.failed     — A post failed to publish
 *   - post.scheduled  — A post was scheduled
 *
 * Setup:
 *   1. Run this server: npx tsx webhook-listener.ts
 *   2. Expose it with ngrok: ngrok http 3456
 *   3. Add the ngrok URL as a webhook endpoint in BulkPublish settings
 *
 * Usage:
 *   npm install express
 *   npx tsx webhook-listener.ts
 *
 * Environment variables:
 *   PORT                    — Server port (default: 3456)
 *   WEBHOOK_SECRET          — Secret for verifying webhook signatures (optional)
 */

import express from "express";
import crypto from "node:crypto";

const PORT = parseInt(process.env.PORT || "3456", 10);
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "";

const app = express();

// Parse JSON bodies with raw body access for signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

/**
 * Verify webhook signature (HMAC-SHA256).
 * BulkPublish sends the signature in the X-Webhook-Signature header.
 */
function verifySignature(rawBody: Buffer, signature: string): boolean {
  if (!WEBHOOK_SECRET) {
    // No secret configured — skip verification (not recommended in production)
    return true;
  }

  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature, "utf-8"),
    Buffer.from(expected, "utf-8")
  );
}

// --- Webhook endpoint ---

app.post("/webhooks/bulkpublish", (req: any, res) => {
  // Verify signature
  const signature = req.headers["x-webhook-signature"] as string;
  if (WEBHOOK_SECRET && signature) {
    if (!verifySignature(req.rawBody, signature)) {
      console.warn("[WEBHOOK] Invalid signature — rejecting");
      return res.status(401).json({ error: "Invalid signature" });
    }
  }

  const event = req.body;
  const eventType = event?.type || "unknown";
  const timestamp = new Date().toISOString();

  console.log(`\n[${timestamp}] Webhook received: ${eventType}`);
  console.log(JSON.stringify(event, null, 2));

  // Handle specific event types
  switch (eventType) {
    case "post.published":
      handlePostPublished(event);
      break;

    case "post.failed":
      handlePostFailed(event);
      break;

    case "post.scheduled":
      handlePostScheduled(event);
      break;

    default:
      console.log(`  Unhandled event type: ${eventType}`);
  }

  // Always respond with 200 to acknowledge receipt
  res.status(200).json({ received: true });
});

// --- Event handlers ---

function handlePostPublished(event: any) {
  const { postId, platform, channelId, publishedUrl } = event.data || {};
  console.log(`  Post #${postId} published to ${platform} (channel ${channelId})`);
  if (publishedUrl) {
    console.log(`  Live URL: ${publishedUrl}`);
  }

  // Example: Send a Slack notification, update a CMS, trigger analytics, etc.
}

function handlePostFailed(event: any) {
  const { postId, platform, channelId, error } = event.data || {};
  console.error(`  Post #${postId} FAILED on ${platform} (channel ${channelId})`);
  console.error(`  Error: ${error || "Unknown error"}`);

  // Example: Alert the team, auto-retry, log to error tracking, etc.
}

function handlePostScheduled(event: any) {
  const { postId, scheduledAt, platforms } = event.data || {};
  console.log(`  Post #${postId} scheduled for ${scheduledAt}`);
  console.log(`  Platforms: ${platforms?.join(", ") || "unknown"}`);

  // Example: Update a calendar, send a confirmation email, etc.
}

// --- Health check ---

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// --- Start server ---

app.listen(PORT, () => {
  console.log("BulkPublish — Webhook Listener");
  console.log("=".repeat(31));
  console.log(`Listening on http://localhost:${PORT}`);
  console.log(`Webhook URL: http://localhost:${PORT}/webhooks/bulkpublish`);
  console.log();
  console.log("To expose publicly, run: ngrok http " + PORT);
  console.log();
  if (!WEBHOOK_SECRET) {
    console.warn(
      "Warning: WEBHOOK_SECRET not set — signature verification is disabled."
    );
    console.warn(
      "Set WEBHOOK_SECRET to match the secret in your BulkPublish webhook settings.\n"
    );
  }
  console.log("Waiting for webhook events...\n");
});
