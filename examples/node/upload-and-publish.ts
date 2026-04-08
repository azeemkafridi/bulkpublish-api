/**
 * Upload and Publish Immediately
 * ==============================
 *
 * Uploads an image from a URL, creates a post with it, and publishes
 * it immediately to all connected channels.
 *
 * Usage:
 *   export BULKPUBLISH_API_KEY=bp_your_key
 *   npx tsx upload-and-publish.ts
 *
 *   # With a custom image:
 *   npx tsx upload-and-publish.ts "https://example.com/my-image.jpg"
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

// --- Helpers ---

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
    throw new Error(`API error (${res.status}): ${msg}`);
  }
  return data as T;
}

async function uploadMedia(
  imageUrl: string,
  filename: string
): Promise<{ id: number; fileName: string }> {
  console.log(`Downloading: ${imageUrl.substring(0, 80)}...`);
  const imageRes = await fetch(imageUrl, { redirect: "follow" });
  if (!imageRes.ok) {
    throw new Error(`Failed to download image: HTTP ${imageRes.status}`);
  }

  const contentType = imageRes.headers.get("content-type") || "image/jpeg";
  const blob = await imageRes.blob();

  console.log(`Uploading to BulkPublish (${(blob.size / 1024).toFixed(0)} KB, ${contentType})...`);
  const formData = new FormData();
  formData.append("file", new File([blob], filename, { type: contentType }));

  const uploadRes = await fetch(`${BASE_URL}/api/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: formData,
  });

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(`Upload failed: ${JSON.stringify(err)}`);
  }

  const { file } = (await uploadRes.json()) as {
    file: { id: number; fileName: string };
  };
  return file;
}

// --- Main ---

async function main() {
  const imageUrl = process.argv[2] || "https://picsum.photos/1200/630";
  const postContent =
    "Fresh content just dropped! Check out what we've been working on.\n\nMore details coming soon.";

  console.log("BulkPublish — Upload and Publish");
  console.log("=".repeat(33));
  console.log();

  // 1. Fetch channels
  console.log("Step 1: Fetching channels...");
  const { channels } = await api<{
    channels: Array<{
      id: number;
      platform: string;
      accountName: string;
      tokenStatus: string;
    }>;
  }>("GET", "/api/channels");

  const validChannels = channels.filter((ch) => ch.tokenStatus !== "expired");
  if (validChannels.length === 0) {
    console.error("No active channels with valid tokens found.");
    process.exit(1);
  }

  console.log(
    `  ${validChannels.length} channel(s): ${validChannels.map((ch) => ch.platform).join(", ")}`
  );
  console.log();

  // 2. Upload media
  console.log("Step 2: Uploading media...");
  const filename = imageUrl.split("/").pop()?.split("?")[0] || "image.jpg";
  const media = await uploadMedia(imageUrl, filename);
  console.log(`  Uploaded: ${media.fileName} (ID: ${media.id})`);
  console.log();

  // 3. Create draft post
  console.log("Step 3: Creating post...");
  const channelEntries = validChannels.map((ch) => ({
    channelId: ch.id,
    platform: ch.platform,
  }));

  const post = await api<{ id: number; status: string }>("POST", "/api/posts", {
    content: postContent,
    channels: channelEntries,
    status: "draft",
    mediaFiles: [media.id],
  });
  console.log(`  Post created: #${post.id} (${post.status})`);
  console.log();

  // 4. Publish immediately
  console.log("Step 4: Publishing...");
  const published = await api<{
    id: number;
    status: string;
    postPlatforms: Array<{ platform: string; status: string }>;
  }>("POST", `/api/posts/${post.id}/publish`);

  console.log(`  Status: ${published.status}`);
  for (const pp of published.postPlatforms) {
    console.log(`    ${pp.platform}: ${pp.status}`);
  }
  console.log();

  console.log("Done! Post is being published to all channels.");
  console.log(`Track progress at: ${BASE_URL}/posts/${post.id}`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
