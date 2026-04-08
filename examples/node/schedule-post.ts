/**
 * Schedule a Post with Media
 * ==========================
 *
 * Demonstrates scheduling a single post with a media attachment
 * to specific channels at a future date/time.
 *
 * Usage:
 *   export BULKPUBLISH_API_KEY=bp_your_key
 *   npx tsx schedule-post.ts
 */

const API_KEY = process.env.BULKPUBLISH_API_KEY;
const BASE_URL = process.env.BULKPUBLISH_BASE_URL || "https://app.bulkpublish.com";

if (!API_KEY) {
  console.error("Error: Set the BULKPUBLISH_API_KEY environment variable.");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${API_KEY}`,
  "Content-Type": "application/json",
};

// --- Configuration ---

const POST_CONTENT =
  "Exciting news! We're launching something special next week. Stay tuned for the big reveal.\n\nWhat do you think it could be? Drop your guesses below!";

const SCHEDULE_HOURS_FROM_NOW = 24; // Schedule 24 hours from now
const TIMEZONE = "America/New_York";

// --- Helpers ---

interface Channel {
  id: number;
  platform: string;
  accountName: string;
  tokenStatus: string;
}

interface Post {
  id: number;
  status: string;
  content: string;
  scheduledAt: string;
  postPlatforms: Array<{ platform: string; channelId: number; status: string }>;
}

async function api<T = unknown>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`API error: ${msg}`);
  }
  return data as T;
}

// --- Main ---

async function main() {
  console.log("BulkPublish — Schedule a Post with Media");
  console.log("=".repeat(42));
  console.log();

  // 1. Fetch channels
  console.log("Fetching channels...");
  const { channels } = await api<{ channels: Channel[] }>("GET", "/api/channels");

  if (channels.length === 0) {
    console.log("No active channels found.");
    process.exit(1);
  }

  console.log(`Found ${channels.length} channel(s):`);
  for (const ch of channels) {
    console.log(`  - ${ch.platform}: ${ch.accountName} (ID: ${ch.id})`);
  }
  console.log();

  // 2. Upload media (example with a placeholder image)
  console.log("Uploading media...");
  const imageUrl = "https://picsum.photos/1200/630"; // Random placeholder image

  const imageRes = await fetch(imageUrl, { redirect: "follow" });
  if (!imageRes.ok) {
    console.error("Failed to download sample image");
    process.exit(1);
  }

  const imageBlob = await imageRes.blob();
  const formData = new FormData();
  formData.append("file", new File([imageBlob], "launch-teaser.jpg", { type: "image/jpeg" }));

  const uploadRes = await fetch(`${BASE_URL}/api/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    console.error("Media upload failed:", err);
    process.exit(1);
  }

  const { file: mediaFile } = (await uploadRes.json()) as {
    file: { id: number; fileName: string; mimeType: string };
  };
  console.log(`Uploaded: ${mediaFile.fileName} (ID: ${mediaFile.id})`);
  console.log();

  // 3. Calculate schedule time
  const scheduledAt = new Date(Date.now() + SCHEDULE_HOURS_FROM_NOW * 60 * 60 * 1000);
  console.log(`Scheduling for: ${scheduledAt.toISOString()} (${TIMEZONE})`);

  // 4. Create the scheduled post
  const channelEntries = channels.map((ch) => ({
    channelId: ch.id,
    platform: ch.platform,
  }));

  console.log("Creating scheduled post...");
  const post = await api<Post>("POST", "/api/posts", {
    content: POST_CONTENT,
    channels: channelEntries,
    status: "scheduled",
    scheduledAt: scheduledAt.toISOString(),
    timezone: TIMEZONE,
    mediaFiles: [mediaFile.id],
  });

  console.log();
  console.log("Post scheduled successfully!");
  console.log(`  ID:           ${post.id}`);
  console.log(`  Status:       ${post.status}`);
  console.log(`  Scheduled at: ${post.scheduledAt}`);
  console.log(`  Channels:     ${post.postPlatforms.map((p) => p.platform).join(", ")}`);
  console.log(`  Media:        1 image attached`);
  console.log();
  console.log(`View at: ${BASE_URL}/posts/${post.id}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
