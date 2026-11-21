#!/usr/bin/env node
// Boots the built server in both profiles over an in-memory transport and
// asserts what the directory reviews check: every listed tool has a title and
// all four hints as explicit booleans, and every core tool a panel calls back
// into is present in the core profile. With --table it prints the
// justification table for the OpenAI / Anthropic submission forms, generated
// from the same map the server ships, so the form cannot drift from the server.
//
//   npm run build && node scripts/check-annotations.mjs [--table]
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, CORE_TOOLS, INBOX_TOOLS, TOOL_ANNOTATIONS, TOOL_OUTPUT_SCHEMAS, withoutUnservedRefs } from "../dist/index.js";
import { z } from "zod";

const HINTS = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"];
// Tools the MCP Apps panels call through the host bridge (src/ui/**).
const WIDGET_CALLBACKS = [
  "create_post", "get_post", "publish_post", "retry_post", "update_post", "delete_post",
  "list_channels", "list_media", "create_media_upload", "finalize_media_upload",
];

async function listTools(profile) {
  const server = createServer({ profile });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "check", version: "0" });
  await Promise.all([client.connect(ct), server.connect(st)]);
  const { tools } = await client.listTools();
  await client.close();
  return tools;
}

let failed = 0;
const fail = (m) => { failed++; console.error("FAIL " + m); };

// Output schemas must accept what the API actually returns. The SDK rejects the
// WHOLE call when structuredContent fails validation, so a schema that is one
// field too strict turns a saved post into a reported error (create_post with
// media, 2026-09-11 — the post existed, the host saw a failure, a retry would
// have duplicated it). These rows are traced from the webapp handlers: POST and
// PATCH /api/posts echo the stored row (media as IDs); GET resolves objects.
const OUTPUT_FIXTURES = {
  create_post: { id: 2276, content: "x", status: "scheduled", scheduledAt: "2026-09-18T18:00:00.000Z", mediaFiles: [3056], postPlatforms: [{ platform: "x", status: "pending" }], labels: [] },
  update_post: { id: 2276, status: "scheduled", mediaFiles: [3056, 3057], postPlatforms: [], labels: [] },
  get_post: { id: 2276, status: "published", mediaFiles: [{ id: 3056, url: "https://images.example/x.jpg" }], postPlatforms: [{ platform: "x", status: "published", platformUrl: "https://x.com/1" }], labels: [{ id: 1, name: "Product" }] },
  publish_post: { id: 1, status: "publishing", mediaFiles: [], postPlatforms: [{ platform: "facebook", status: "pending" }] },
  list_posts: { posts: [{ id: 1, mediaFiles: [] }, { id: 2, mediaFiles: [{ id: 5 }] }], total: 2, page: 1, limit: 20, totalPages: 1 },
  get_queue_slot: { scheduledAt: "2026-09-11T14:11:02.530Z", dayLabel: "Today" },
  upload_media: { file: { id: 3056, fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 127085, width: 1200, height: 630 } },
  list_channels: { channels: [{ id: 143, platform: "instagram", accountName: "Acme Studio", isActive: true, needsReconnect: false }] },
  list_labels: { items: [{ id: 1, name: "Product", color: "#FA8112", organizationId: 10 }, { id: 2, name: "Promo", color: null }] },
  get_channel_options: { type: "boards", items: [{ id: "1234567890", name: "Recipes" }] },
  update_channel: { success: true },
  approve_post: { id: 9, status: "scheduled", approvalStatus: "approved", mediaFiles: [3056], postPlatforms: [] },
  reject_post: { id: 9, status: "draft", approvalStatus: "rejected", mediaFiles: [], postPlatforms: [] },
  // Inbox profile — shapes from the webapp's openapi.json responses.
  list_conversations: { conversations: [{ id: 7, platform: "instagram", kind: "mention", url: null, labels: [{ id: 3, name: "VIP", color: null }], rating: null, status: "open", snoozedUntil: null, assignee: null, channel: { id: 143, accountName: "Acme", profileImage: null }, participant: { id: "p1", name: "Sam" }, unreadCount: 2, lastMessageAt: "2026-10-05T10:00:00.000Z", lastInboundAt: "2026-10-05T10:00:00.000Z", lastMessagePreview: "Hi", canReply: true, attachments: { max: 1, kinds: ["image"] }, replyNotice: null }], nextCursor: null, offset: 0, total: 1 },
  get_conversation: { conversationId: 7, messages: [{ id: 1, platformMessageId: "m1", direction: "in", text: null, attachments: null, rating: null, sentAt: "2026-10-05T10:00:00.000Z", readAt: null, actor: null, authorUserId: null, author: null, parentId: null, likeCount: null }] },
  reply_to_conversation: { success: true, messageId: "m2" },
  update_conversation: { success: true },
  list_post_comments: { postId: 9, platforms: [{ postPlatformId: 4, platform: "x", accountName: "Acme", platformPostId: "1", platformUrl: null, engagement: { comments: [{ id: "c1", text: "nice" }], reactions: [], commentActions: ["like"] } }, { platform: "tiktok", accountName: null, platformPostId: null, platformUrl: null, engagement: null, error: "Could not load engagement for this platform." }] },
  reply_to_comment: { success: true, replyId: null, accountName: null },
  moderate_comment: { success: true, action: "hide" },
  // Joined the hosted profile 2026-11-20; shapes from the webapp routes.
  get_channel_health: { healthy: false, tokenStatus: "expired", message: "Access was revoked or expired. Please reconnect this channel." },
  get_media: { file: { id: 3056, fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 127085, width: 1200, height: 630, duration: null, isOriginalDeleted: false, altText: null, originalUrl: "https://media.example/a.jpg", thumbnailUrl: null, previewUrl: null, largeUrl: null, createdAt: "2026-11-01T10:00:00.000Z" } },
  update_media: { file: { id: 3056, organizationId: 10, altText: "A red bicycle", variants: {}, createdAt: "2026-11-01T10:00:00.000Z" } },
  delete_media: { success: true, deletedId: 3056 },
  list_templates: { templates: [{ id: 4, organizationId: 10, createdBy: "u1", name: "Launch", content: "New: {{product}}", kind: "caption", channelIds: [143], postFormat: null, postTypeOverrides: null, mediaFileIds: [3056], platformMediaFileIds: null, platformContent: null, media: [{ id: 3056, url: "https://media.example/a.jpg" }], createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z" }] },
  list_hashtag_groups: { groups: [{ id: 2, organizationId: 10, createdBy: "u1", name: "Brand", hashtags: ["acme", "studio"], createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:00:00.000Z" }] },
  // GET /api/schedules answers a bare array; attachStructured wraps it as { items }.
  list_schedules: { items: [{ id: 9, name: "Tips", frequency: "weekly", dayOfWeek: [1, 3], dayOfMonth: null, timeOfDay: "09:00", timezone: "UTC", channelIds: [143], mediaFileIds: [], contentTemplate: "Tip of the week", isActive: true, lastRunAt: null, nextRunAt: "2026-11-23T09:00:00.000Z", createdAt: "2026-11-01T10:00:00.000Z" }] },
  update_schedule: { id: 9, name: "Tips", frequency: "weekly", dayOfWeek: [1], timeOfDay: "09:00", timezone: "UTC", isActive: false, nextRunAt: null },
  delete_schedule: { success: true },
  share_post: { shareToken: "abc", url: "https://app.example/p/abc", created: true },
  unshare_post: { success: true, revoked: false },
  create_label: { id: 12, userId: "u1", organizationId: 10, name: "Promo", color: "#6366f1", type: "post", createdAt: "2026-11-01T10:00:00.000Z" },
  // Joined the hosted profile 2026-11-21; shapes from the webapp's openapi.json and routes.
  add_conversation_note: { success: true, message: { id: 31, direction: "note", text: "Refund sent", sentAt: "2026-11-21T10:00:00.000Z", authorUserId: "u1", author: { id: "u1", name: "Sam", image: null } } },
  set_conversation_labels: { success: true, labelIds: [3, 4] },
  list_saved_replies: { savedReplies: [{ id: 2, name: "Refund", body: "Hi {{first_name}}, your refund is on its way.", createdBy: null, updatedAt: "2026-11-21T10:00:00.000Z" }], variables: [{ key: "first_name", description: "The person's first name" }] },
  create_saved_reply: { id: 2, name: "Refund", body: "Hi {{first_name}}", createdBy: "u1", updatedAt: "2026-11-21T10:00:00.000Z" },
  get_best_times: { from: "2026-11-01", to: "2026-11-21", timezone: "UTC", postCount: 12, excludedPosts: 2, minPosts: 3, slots: [{ weekday: "monday", hour: 9, posts: 3, avgEngagements: 14.3, avgImpressions: null }], best: [], enoughData: false },
  get_post_metrics_history: { postId: 9, publishedAt: "2026-11-01T10:00:00.000Z", series: [{ postPlatformId: 4, platform: "x", channelId: 143, accountName: "Acme", supportedMetrics: ["impressions"], metricsSupported: true, points: [{ fetchedAt: "2026-11-01T16:00:00.000Z", impressions: 10 }] }] },
  get_link_analytics: { from: "2026-11-01", to: "2026-11-21", totalClicks: 5, totalLinks: 1, links: [{ id: 1, shortUrl: "https://bulkpubli.sh/abc", code: "abc", originalUrl: "https://example.com", clicks: 5, lastClickAt: null, platform: "x", channelId: 143, postId: 9, postContent: "Hi" }], previous: null },
  list_activity: { activities: [{ id: 1, userId: "u1", organizationId: 10, action: "post.published", resource: "post", resourceId: "9", details: null, level: "info", ipAddress: null, createdAt: "2026-11-21T10:00:00.000Z", actor: null }], pagination: { page: 1, limit: 20, total: 1, totalPages: 1 } },
  create_schedule: { id: 9, name: "Tips", frequency: "weekly", dayOfWeek: 1, timeOfDay: "09:00", timezone: "UTC", isActive: true, nextRunAt: "2026-11-23T09:00:00.000Z", channelIds: [143] },
  bulk_posts: { success: true, action: "delete", affected: 3, skippedInProgress: 0 },
};
for (const [tool, fixture] of Object.entries(OUTPUT_FIXTURES)) {
  const shape = TOOL_OUTPUT_SCHEMAS[tool];
  if (!shape) { fail(`${tool}: no output schema`); continue; }
  const res = z.object(shape).passthrough().safeParse(fixture);
  if (!res.success) fail(`${tool}: output schema rejects a real API response — ${JSON.stringify(res.error.issues[0])}`);
}

const byProfile = {};
for (const profile of ["core", "inbox", "full"]) {
  const tools = await listTools(profile);
  byProfile[profile] = tools;
  for (const t of tools) {
    if (!t.title) fail(`${profile}/${t.name}: no title`);
    if (!t.description || t.description.length < 20) fail(`${profile}/${t.name}: description too short`);
    for (const h of HINTS) {
      if (typeof t.annotations?.[h] !== "boolean") fail(`${profile}/${t.name}: ${h} is ${t.annotations?.[h]} (must be true|false)`);
    }
    if (t.annotations?.readOnlyHint && t.annotations?.destructiveHint) fail(`${profile}/${t.name}: readOnly and destructive both true`);
    if (!TOOL_ANNOTATIONS[t.name]?.why) fail(`${profile}/${t.name}: no justification`);
  }
  const names = new Set(tools.map((t) => t.name));
  // No served definition may point at a tool this profile does not serve:
  // the ChatGPT directory flags that as claiming a capability the server
  // lacks (create_post → get_channel_options/search_mentions, 2026-10-24).
  // Fix by adding a rewrite to UNSERVED_REF_REWRITES in src/index.ts.
  const known = Object.keys(TOOL_ANNOTATIONS);
  for (const t of tools) {
    const text = JSON.stringify(t);
    for (const other of known) {
      if (other !== t.name && !names.has(other) && new RegExp(`\\b${other}\\b`).test(text)) {
        fail(`${profile}/${t.name}: refers to ${other}, which ${profile} does not serve`);
      }
    }
  }
  if (profile === "core" || profile === "inbox") {
    // Every hosted tool declares an outputSchema: OpenAI's review flags the ones
    // that don't. Declaring one obliges the handler to return structuredContent
    // (the SDK rejects the call otherwise), so the two ship together.
    for (const t of tools) {
      if (!t.outputSchema) fail(`${profile}: ${t.name}: no outputSchema`);
    }
    const expected = new Set(profile === "core" ? CORE_TOOLS : [...CORE_TOOLS, ...INBOX_TOOLS]);
    for (const n of expected) if (!names.has(n)) fail(`${profile}: ${n} expected in the profile but not registered`);
    for (const n of names) if (!expected.has(n)) fail(`${profile}: ${n} registered but not in the profile's tool list`);
    for (const n of WIDGET_CALLBACKS) if (!names.has(n)) fail(`${profile}: panel callback ${n} missing — a widget button would break`);
  }
  if (profile === "inbox" || profile === "full") {
    // Core is what both directories approved. Serving it inside a larger
    // profile must not change a byte of any core tool: name, title,
    // description, input and output schemas, annotations, _meta. The one
    // allowed difference is a larger profile keeping its pointers to helper
    // tools core does not serve, so compare with those taken out.
    const coreServed = new Set(byProfile.core.map((x) => x.name));
    for (const c of byProfile.core) {
      const t = tools.find((x) => x.name === c.name);
      if (!t) fail(`${profile}: core tool ${c.name} missing`);
      else if (JSON.stringify(withoutUnservedRefs(t, coreServed)) !== JSON.stringify(c)) fail(`${profile}: core tool ${c.name} differs from the core profile`);
    }
    for (const n of INBOX_TOOLS) if (!names.has(n)) fail(`${profile}: inbox tool ${n} missing`);
  }
  console.log(`${profile}: ${tools.length} tools, all annotated`);
}

if (process.argv.includes("--table")) {
  const tools = await listTools(process.argv.includes("--full") ? "full" : process.argv.includes("--inbox") ? "inbox" : "core");
  const b = (v) => (v ? "true" : "false");
  console.log("\n| Tool | readOnly | destructive | idempotent | openWorld | Justification |\n|---|---|---|---|---|---|");
  for (const t of tools) {
    const a = t.annotations;
    console.log(`| \`${t.name}\` | ${b(a.readOnlyHint)} | ${b(a.destructiveHint)} | ${b(a.idempotentHint)} | ${b(a.openWorldHint)} | ${TOOL_ANNOTATIONS[t.name].why} |`);
  }
}
process.exit(failed ? 1 : 0);
