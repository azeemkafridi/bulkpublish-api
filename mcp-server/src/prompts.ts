// ---------------------------------------------------------------------------
// MCP prompts
// ---------------------------------------------------------------------------
// Ready-made starting points a host lists in its prompt / slash menu. Each one
// is a task brief for the model, written against the tools this server really
// serves, so every claim in it was checked against the tool's schema or the
// API behind it.
//
// A prompt is registered only when every tool in `requires` is served by the
// instance being built (profile + HIDE_BILLING), so the hosted `core` server
// never lists a prompt it cannot carry out. Optional tools are mentioned only
// through `ctx.has(...)`. `npm run check:prompts` renders every prompt in every
// profile and fails on a tool name that the instance does not serve, on prose
// promising a feature that profile lacks, and on stack disclosure.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export type PromptCtx = {
  /** Whether this server instance serves the named tool. */
  has: (tool: string) => boolean;
  /** Hosted server: tools run on our machine, so local file paths are refused. */
  hosted: boolean;
};

type Arg = { description: string; required?: boolean };

export type PromptDef = {
  name: string;
  title: string;
  description: string;
  /** Every tool the prompt cannot work without. */
  requires: string[];
  args?: Record<string, Arg>;
  text: (a: Record<string, string | undefined>, ctx: PromptCtx) => string;
};

// ---- Shared wording --------------------------------------------------------

const CONFIRM =
  "Never publish, send, reply, delete, revoke or schedule anything without first showing the user exactly what will happen (text, channels, time, media) and getting a clear yes.";
const TZ =
  "Work in the user's timezone: ask for it if you do not know it, and pass it as an IANA name such as America/New_York.";
const ROLE_NOTE =
  "If list_channels shows in `capabilities` that the user cannot publish, do not call publish_post: a scheduled post they create waits for a teammate's approval instead.";

function given(label: string, v: string | undefined): string {
  return v && v.trim() ? `\n${label}: ${v.trim()}` : "";
}

function mediaSources(ctx: PromptCtx): string {
  const parts = [
    "a public link to the file (pass it as `url`)",
    "a file the chat hands to the tool directly (pass it as `file`)",
  ];
  if (!ctx.hosted) parts.push("a path to a file on this computer (pass it as `filePath`)");
  return (
    `Upload media with upload_media from ${parts.join(", ")}. ` +
    "Supported: JPEG, PNG, WebP, GIF, MP4, MOV, WebM, and PDF / Word / PowerPoint documents (documents publish only to LinkedIn, as a `document` post), up to 100MB."
  );
}

const MEDIA_RULES =
  "Media rules the server enforces: YouTube needs a video. TikTok needs a video, or 1 to 35 images with postTypeOverrides.tiktok 'photo_slideshow' (images only, no video); neither goes on a text-only post. " +
  "Instagram defaults to a feed photo, so a video needs postTypeOverrides.instagram 'reel' or 'feed_video', and a carousel needs at least 2 files. " +
  "A Pinterest carousel takes 2 to 5 images. Every Snapchat post needs exactly one image or video. " +
  "Video lengths are checked when the post is scheduled or published: Instagram reel/feed_video 3s to 15min, story 3s to 60s; Facebook reel 3s to 90s, story 3s to 60s; Threads video up to 5min; LinkedIn 3s to 30min; Pinterest video pin at least 4s; Snapchat story 5s to 60s, spotlight 6s to 60s.";

const THREAD_RULES =
  "Threads (chains of posts, each replying to the one before) publish on X, Threads, Bluesky and Mastodon only, so put only those channels on a thread post. " +
  "Use postFormat 'thread' with at least 2 threadParts. Every part is measured against the character limit of every platform on the post, and an over-long part is refused naming the part, the platform and its limit. " +
  "On X and Mastodon a link counts as 23 characters. platformThreadParts gives one platform its own parts.";

// ---- Per-platform guides ---------------------------------------------------
// Only fields that exist on create_post's schema, with the limits it states.

type PlatformGuide = { label: string; guide: (ctx: PromptCtx) => string };

const PLATFORM_GUIDES: Record<string, PlatformGuide> = {
  facebook: {
    label: "Facebook",
    guide: () =>
      "Post types (postTypeOverrides.facebook): post, video, reel, story, carousel. A reel runs 3s to 90s, a story 3s to 60s. " +
      "platformSpecific.facebook: `thumbnailUrl` sets a cover for a video or reel (applied just after it publishes); `textFormatPresetId` (digits) shows a short text post on a coloured background, but only on a Page feed post with no media or link card and at most 130 characters; `shareToStory`.",
  },
  instagram: {
    label: "Instagram",
    guide: () =>
      "Post types (postTypeOverrides.instagram): feed_photo (the default), feed_video, reel, story, carousel (2 or more files). Instagram needs media. " +
      "platformSpecific.instagram: `collaborators` (comma-separated usernames without @, not on stories); `userTags` (up to 20 per photo or video; on a photo each tag needs x and y from 0 to 1, on a reel or video only the username counts; carousel videos and stories carry none); " +
      "`locationId` (digits: a Facebook Page that has a location); `shareToFeed` (reels); `trialReel` with `graduationStrategy` 'manual' or 'auto' (reel only); a cover via `coverUrl` or `thumbnailTimestamp` (coverUrl wins); `shareToStory`.",
  },
  x: {
    label: "X",
    guide: () =>
      "Post types (postTypeOverrides.x): tweet, video, thread, repost. A link counts as 23 characters. " +
      "platformSpecific.x: `poll` with 2 to 4 options of 1 to 25 characters and `durationMinutes` from 5 to 10080 (not with media or a quote); `quoteId` (post ID or x.com status link); `repostId` with type 'repost'; " +
      "`replySettings` (everyone, following, verified, subscribers, mentionedUsers); `communityId` (the account must be a member) with optional `shareWithFollowers`.",
  },
  tiktok: {
    label: "TikTok",
    guide: () =>
      "A TikTok post is a video, or a photo slideshow of 1 to 35 images with postTypeOverrides.tiktok 'photo_slideshow' (images only; without that type, images are refused). platformSpecific.tiktok: `privacyLevel` (PUBLIC_TO_EVERYONE by default, or MUTUAL_FOLLOW_FRIENDS, FOLLOWER_OF_CREATOR, SELF_ONLY), `disableDuet`, `disableStitch`, `disableComment`, `isAigc` for AI-generated content, " +
      "`brandContentToggle` / `brandOrganicToggle` for paid or own-brand promotion, `thumbnailTimestamp` (video cover frame, seconds); for a slideshow, `photoCoverIndex` (cover image, counting from 0) and `autoAddMusic: true` to let TikTok add a track (off by default). `sendToDrafts: true` delivers it to the creator's TikTok drafts instead of publishing (a video draft carries no caption, a photo draft does).",
  },
  youtube: {
    label: "YouTube",
    guide: (ctx) =>
      "A YouTube post needs a video. Post types (postTypeOverrides.youtube): video or short. " +
      "platformSpecific.youtube: `title`, `privacyStatus` (public, private, unlisted), `madeForKids`, `categoryId`, " +
      (ctx.has("get_channel_options") ? "`playlistId` (list playlists with get_channel_options), " : "`playlistId`, ") +
      "`thumbnailUrl`, `containsSyntheticMedia` (realistic altered or synthetic content), `notifySubscribers: false` to publish quietly, `license`, `embeddable`, `publicStatsViewable`, `defaultLanguage`, `defaultAudioLanguage`, `recordingDate`.",
  },
  threads: {
    label: "Threads",
    guide: (ctx) =>
      "Post types (postTypeOverrides.threads): text, image, video, carousel, repost; it also takes thread posts. Video up to 5 minutes. " +
      "platformSpecific.threads: `topicTag` (one tag, no #, no periods or ampersands); `replyControl` (everyone, accounts_you_follow, mentioned_only, parent_post_author_only, followers_only); " +
      "`pollOptions` (2 to 4, each 1 to 25 characters, text posts only); `linkAttachment` (preview card on a text post; more than 5 links in total is refused); `quotePostId`; `repostId` (numeric ID) with type 'repost'; " +
      (ctx.has("get_channel_options")
        ? "`locationId` from get_channel_options with a `q` search (only once the channel has granted location tagging)."
        : "`locationId` (a numeric place ID, only once the channel has granted location tagging)."),
  },
  bluesky: {
    label: "Bluesky",
    guide: () =>
      "Post types (postTypeOverrides.bluesky): post, video, thread, repost. " +
      "platformSpecific.bluesky: `replyAllow` (['nobody'] or any mix of mention, following, follower; omitted means everyone), `allowQuotes: false`, `quoteId` (bsky.app link or at:// URI), " +
      "`langs` (up to 3 codes), `contentLabel` (sexual, nudity, porn, graphic-media), `repostId` with type 'repost'.",
  },
  pinterest: {
    label: "Pinterest",
    guide: (ctx) =>
      "Pinterest needs an image or video. Post types (postTypeOverrides.pinterest): pin, video_pin (at least 4s), carousel (2 to 5 images). " +
      "platformSpecific.pinterest: `boardId` " +
      (ctx.has("get_channel_options")
        ? "(list boards with get_channel_options; with a boardId it lists that board's sections for `boardSectionId`)"
        : "") +
      " (without one the pin goes to the account's default board), `title`, `description`, `link`, `dominantColor`, and for a video pin `coverImageUrl` or `coverKeyFrameTime`.",
  },
  gmb: {
    label: "Google Business Profile",
    guide: () =>
      "Post types (postTypeOverrides.gmb): standard, event, offer. platformSpecific.gmb: `ctaType` (BOOK, ORDER, SHOP, LEARN_MORE, SIGN_UP, CALL) with `ctaUrl`; " +
      "for an event `eventTitle`, `startDate`, `startTime`, `endDate`, `endTime`; for an offer `couponCode`, `redeemOnlineUrl`, `termsConditions`. Google reports no post metrics back.",
  },
  linkedin: {
    label: "LinkedIn",
    guide: (ctx) =>
      "Post types (postTypeOverrides.linkedin) include post, multi_image, document (exactly one PDF, Word or PowerPoint file, titled by platformSpecific.linkedin.documentTitle), poll and reshare. Video runs 3s to 30min. " +
      "A poll needs post text, no media, and platformSpecific.linkedin.poll: a question up to 140 characters, 2 to 4 options up to 30 characters, duration ONE_DAY, THREE_DAYS (default), SEVEN_DAYS or FOURTEEN_DAYS. " +
      "A reshare needs `reshareId` (a LinkedIn post link or urn:li:share / urn:li:ugcPost ID; activity links cannot be reshared). Also `visibility` (PUBLIC, CONNECTIONS on personal profiles, LOGGED_IN), `disableReshare`, `thumbnailUrl` for a video. " +
      "Mentions are written @[Display Name](urn:li:organization:ID) or @[Display Name](urn:li:person:ID)" +
      (ctx.has("search_mentions") ? "; search_mentions on the LinkedIn channel with a Page's URL slug returns a ready token (check its vanityName is the Page you meant)." : "."),
  },
  mastodon: {
    label: "Mastodon",
    guide: () =>
      "Post types (postTypeOverrides.mastodon): post, thread, repost. A link counts as 23 characters. " +
      "platformSpecific.mastodon: `poll` (2 to 4 options of 1 to 50 characters, `expiresIn` 300 to 2629746 seconds, optional `multiple` and `hideTotals`; not with media), `sensitive` (hides media behind a click), " +
      "`quoteId` (needs a server on Mastodon 4.5 or later), `repostId` to boost with type 'repost'.",
  },
  discord: {
    label: "Discord",
    guide: (ctx) =>
      "Discord options go under the BulkPublish channel id: platformSpecific.discord = { \"<channelId>\": { … } } (a flat object applies to every Discord channel on the post). " +
      "`channelId` inside it is REQUIRED: the Discord text channel to post in" +
      (ctx.has("get_channel_options") ? ", listed by get_channel_options" : "") +
      ". Optional: `silent`, `buttons` (up to 5, label up to 80 characters), `startThread` + `threadName`, `embed` (title up to 256 characters, colour), " +
      "`poll` (question up to 300 characters, 2 to 10 answers up to 55, `durationHours` 1 to 768), `pin`, forum `tags` (up to 5). A Discord failure is a bot permission problem, never a reconnect.",
  },
  telegram: {
    label: "Telegram",
    guide: () =>
      "Telegram options go under the BulkPublish channel id: platformSpecific.telegram = { \"<channelId>\": { … } } (or flat for every Telegram channel). Text is sent as plain text; past 1024 characters with media it goes as a second message. " +
      "Options: `silent`, `protectContent`, `pin`, `threadId` (forum topic), `buttons` (up to 3, label up to 64 characters), `spoiler`, `disablePreview`, " +
      "`poll` (question 1 to 300 characters, 2 to 12 options up to 100, `anonymous`, `multipleAnswers`, or `quiz` with `correctOption`).",
  },
  tumblr: {
    label: "Tumblr",
    guide: (ctx) =>
      "Tumblr options go under the BulkPublish channel id: platformSpecific.tumblr = { \"<channelId>\": { … } } (or flat). Up to 30 images OR one video. " +
      "Options: `blogName`" +
      (ctx.has("get_channel_options") ? " (list blogs with get_channel_options)" : "") +
      ", `title`, `tags` (no #), `link`, `sourceUrl`, `state` (published, queue, draft, private), `slug`, `reblogInteraction`, `reblogUrl` to reblog a Tumblr post with your text as the comment.",
  },
  snapchat: {
    label: "Snapchat",
    guide: () =>
      "Every Snapchat post needs exactly one image or video. Post types (postTypeOverrides.snapchat): story (default; the caption is NOT sent; videos 5s to 60s), saved_story (has a title, up to 45 characters), spotlight (video only, 6s to 60s; the caption becomes its description, up to 160 characters). " +
      "Options go under the BulkPublish channel id: platformSpecific.snapchat = { \"<channelId>\": { title, locale, saveToProfile } }.",
  },
};

// ---- The prompts -----------------------------------------------------------

const PROMPTS: PromptDef[] = [
  // ======== Getting started ========
  {
    name: "getting_started",
    title: "Get started with BulkPublish",
    description: "A quick tour: which accounts are connected, what is scheduled next, and what was published recently.",
    requires: ["list_channels", "list_posts"],
    text: () =>
      "Give me a short overview of my BulkPublish account.\n" +
      "1. Call list_channels and summarise the connected accounts by platform, flagging any that need reconnecting, and say from `capabilities` whether I can create, publish and approve posts.\n" +
      "2. Call list_posts with status 'scheduled' and order 'asc' (limit 10) and list what goes out next, with times.\n" +
      "3. Call list_posts with status 'failed' and again with status 'partial' and tell me if anything needs attention.\n" +
      "4. Suggest two or three useful next steps based on what you found. Change nothing.",
  },
  {
    name: "check_channel_connections",
    title: "Check channel connections",
    description: "Find accounts that are disconnected, need reconnecting, or have expiring access.",
    requires: ["list_channels"],
    text: (_a, ctx) =>
      "Check the health of my connected accounts.\n" +
      "Call list_channels, then list_channels with active false to include disconnected ones. For each account report platform, name, whether it needs reconnecting and its token status." +
      (ctx.has("get_channel_health") ? " For any that look unhealthy, call get_channel_health for the detail." : "") +
      "\nReconnecting happens on the Channels page of the BulkPublish app; tell me which ones to reconnect there. Change nothing.",
  },
  {
    name: "platform_availability",
    title: "Which platforms can I use?",
    description: "List every supported platform and whether it can be connected and posted to right now.",
    requires: ["list_platforms", "list_channels"],
    text: () =>
      "Call list_platforms and list_channels. Tell me which platforms I can connect and post to right now, which are paused (state 'off' holds scheduled posts until re-enabled; 'connect_off' blocks new connections but existing channels keep publishing), and any sub-platform variants such as LinkedIn company pages. Then say which of my connected accounts are affected.",
  },
  {
    name: "plan_usage",
    title: "Check plan usage",
    description: "How much of the plan's posts, channels and storage are used.",
    requires: ["get_quota_usage"],
    text: () =>
      "Call get_quota_usage and summarise my daily and monthly post counts, scheduled posts, channels and media storage against their limits, including any extra channel slots and whether they renew. Point out anything close to its limit.",
  },

  // ======== Writing and scheduling ========
  {
    name: "draft_post",
    title: "Draft a post",
    description: "Write a post from an idea and save it as a draft on the accounts you choose. Nothing is published.",
    requires: ["list_channels", "create_post"],
    args: {
      topic: { description: "What the post is about, or the text to use.", required: true },
      channels: { description: "Which accounts or platforms to target (optional)." },
    },
    text: (a) =>
      "Draft a social post and save it as a draft." +
      given("Topic", a.topic) +
      given("Target accounts", a.channels) +
      "\n1. Call list_channels to get channel IDs (ask which accounts to use if I did not say).\n" +
      "2. Write the post. Where platforms differ (length, tone, hashtags), put each platform's version in platformContent.\n" +
      "3. Show me the text per platform and wait for my OK, then call create_post with status 'draft' (the default).\n" +
      MEDIA_RULES +
      "\nReport the new post ID. Nothing is published by a draft.",
  },
  {
    name: "schedule_post",
    title: "Schedule a post",
    description: "Write and schedule a post for a specific time, or the next free slot in your queue.",
    requires: ["list_channels", "create_post", "get_queue_slot"],
    args: {
      topic: { description: "What the post is about, or the text to use.", required: true },
      when: { description: "When to publish, e.g. 'tomorrow 9am' (optional: defaults to the next queue slot)." },
      channels: { description: "Which accounts or platforms to target (optional)." },
    },
    text: (a) =>
      "Schedule a social post." +
      given("Topic", a.topic) +
      given("When", a.when) +
      given("Target accounts", a.channels) +
      "\n" + TZ +
      "\n1. Call list_channels for channel IDs.\n" +
      "2. If no time was given, call get_queue_slot with my timezone and offer that slot.\n" +
      "3. Write the post (platformContent for per-platform versions). Show me the text, accounts and exact time and wait for my yes.\n" +
      "4. Call create_post with status 'scheduled', scheduledAt (ISO 8601, in the future) and timezone.\n" +
      MEDIA_RULES +
      "\n" + ROLE_NOTE,
  },
  {
    name: "publish_now",
    title: "Publish a post now",
    description: "Write a post and publish it immediately, after you confirm.",
    requires: ["list_channels", "create_post", "publish_post"],
    args: {
      topic: { description: "What to post, or the text to use.", required: true },
      channels: { description: "Which accounts or platforms (optional)." },
    },
    text: (a) =>
      "Publish a post right now." +
      given("Topic", a.topic) +
      given("Target accounts", a.channels) +
      "\n1. Call list_channels for channel IDs and check `capabilities`.\n" +
      "2. Write the post, show me exactly what will go out and where, and wait for my clear yes.\n" +
      "3. Call create_post (status 'draft'), then publish_post with its ID.\n" +
      "If my role cannot publish (publish_post answers APPROVAL_REQUIRED), instead create it with status 'scheduled', scheduledAt set to now, requestApproval true and publishWhenApproved true, so it goes out the moment a teammate approves it, and tell me that is what happened.\n" +
      "Afterwards call get_post and report each platform's status and link. A published post cannot be recalled from here.\n" +
      MEDIA_RULES,
  },
  {
    name: "add_to_queue",
    title: "Add a post to the queue",
    description: "Schedule a post into your next free queue slot, or at the very end of the queue.",
    requires: ["list_channels", "create_post", "get_queue_slot"],
    args: {
      topic: { description: "What to post.", required: true },
      position: { description: "'next' (default) for the next free slot, or 'end' for the bottom of the queue." },
    },
    text: (a) =>
      "Add a post to my queue." +
      given("Topic", a.topic) +
      given("Position", a.position) +
      "\n" + TZ +
      "\nCall get_queue_slot with my timezone and position '" + (a.position?.trim() === "end" ? "end" : "next") + "'. Write the post, call list_channels for the accounts, show me the text, accounts and slot time, and on my yes call create_post with status 'scheduled' and that scheduledAt.\n" +
      MEDIA_RULES,
  },
  {
    name: "compose_in_editor",
    title: "Open the post composer",
    description: "Open the interactive composer, pre-filled with your text, to pick accounts and media yourself.",
    requires: ["compose_post"],
    args: { text: { description: "Text to pre-fill (optional)." } },
    text: (a) =>
      "Open the BulkPublish composer with compose_post" +
      (a.text?.trim() ? ", passing this as `content`:\n" + a.text.trim() : ".") +
      "\nI will choose accounts and media and submit from the panel.",
  },
  {
    name: "cross_post_adapted",
    title: "Cross-post, adapted per platform",
    description: "One message rewritten to fit each platform's length, tone and format, in a single post.",
    requires: ["list_channels", "create_post"],
    args: {
      message: { description: "The core message or source text.", required: true },
      when: { description: "When to publish (optional; saved as a draft if empty)." },
    },
    text: (a) =>
      "Turn one message into a post that fits every connected platform." +
      given("Message", a.message) +
      given("When", a.when) +
      "\nCall list_channels. Write one version per platform in platformContent (short and punchy for X and Bluesky, where a link counts as 23 characters on X and Mastodon; professional on LinkedIn; caption plus hashtags on Instagram; title-style for Pinterest), keeping `content` as the default.\n" +
      "Show me every version side by side and wait for my OK. Then call create_post once with all the channels: status 'draft', or 'scheduled' with scheduledAt and timezone if I gave a time.\n" +
      MEDIA_RULES,
  },
  {
    name: "write_thread",
    title: "Write a thread",
    description: "Turn an idea or article into a multi-part thread for X, Threads, Bluesky or Mastodon.",
    requires: ["list_channels", "create_post"],
    args: {
      source: { description: "The idea, notes or article text.", required: true },
      parts: { description: "Roughly how many parts (optional)." },
    },
    text: (a) =>
      "Write a thread." +
      given("Source", a.source) +
      given("Parts", a.parts) +
      "\n" + THREAD_RULES +
      "\nCall list_channels and pick only X, Threads, Bluesky and Mastodon accounts. Write the parts (hook first, one idea per part, a closing part), show them numbered with character counts, and on my OK call create_post with postFormat 'thread' and threadParts, as a draft unless I give a time.",
  },
  {
    name: "post_with_media",
    title: "Post with images or video",
    description: "Upload images or a video and attach them to a new post.",
    requires: ["list_channels", "upload_media", "create_post"],
    args: {
      media: { description: "Links to the files, or a description of what is attached.", required: true },
      caption: { description: "Caption or topic (optional)." },
    },
    text: (a, ctx) =>
      "Create a post with media." +
      given("Media", a.media) +
      given("Caption", a.caption) +
      "\n" + mediaSources(ctx) +
      "\nUpload each file and keep the returned media IDs." +
      (ctx.has("update_media") ? " For images, offer to write alt text and set it with update_media (it is sent to Instagram, LinkedIn, X, Bluesky, Tumblr and Discord)." : "") +
      "\nCall list_channels, write the caption, choose post types with postTypeOverrides where needed, show me the plan and on my OK call create_post with mediaFileIds (as a draft unless I give a time).\n" +
      MEDIA_RULES,
  },
  {
    name: "reuse_library_media",
    title: "Post from the media library",
    description: "Find a file already in your media library and build a post around it.",
    requires: ["list_media", "list_channels", "create_post"],
    args: { search: { description: "File name to search for, or the kind of media (image, video, document)." } },
    text: (a) =>
      "Build a post from my media library." +
      given("Looking for", a.search) +
      "\nCall list_media (use `search` for a file name, or `type` image / video / document) and show me the matches. Once I pick, call list_channels, write a caption, and on my OK call create_post with that file's ID in mediaFileIds.\n" +
      MEDIA_RULES,
  },
  {
    name: "video_post",
    title: "Publish a video everywhere",
    description: "Post one video as a YouTube video or Short, TikTok, Instagram Reel, Facebook Reel and more, with the right settings for each.",
    requires: ["list_channels", "upload_media", "create_post"],
    args: {
      video: { description: "Link to the video, or say it is attached.", required: true },
      topic: { description: "What the video is about (optional)." },
    },
    text: (a, ctx) =>
      "Publish a video across my accounts." +
      given("Video", a.video) +
      given("Topic", a.topic) +
      "\n" + mediaSources(ctx) +
      "\nThen call list_channels and set postTypeOverrides per platform: youtube 'video' or 'short', instagram 'reel' (or 'feed_video'), facebook 'reel' or 'video', snapchat 'spotlight' or 'story'; TikTok and LinkedIn take it as is.\n" +
      PLATFORM_GUIDES.youtube.guide(ctx) + "\n" + PLATFORM_GUIDES.tiktok.guide(ctx) +
      "\n" + MEDIA_RULES +
      "\nShow me titles, captions and settings per platform and wait for my OK before create_post.",
  },
  {
    name: "carousel_post",
    title: "Create a carousel",
    description: "A multi-image post: Instagram, Facebook or Threads carousel, Pinterest carousel, LinkedIn multi-image, TikTok photo slideshow.",
    requires: ["list_channels", "upload_media", "create_post"],
    args: { images: { description: "Links to the images, or say they are attached.", required: true } },
    text: (a, ctx) =>
      "Create a carousel post." +
      given("Images", a.images) +
      "\n" + mediaSources(ctx) +
      "\nUpload in the order they should appear. Set postTypeOverrides: instagram 'carousel' (2 or more files), facebook 'carousel', threads 'carousel', pinterest 'carousel' (2 to 5 images), linkedin 'multi_image', tiktok 'photo_slideshow' (1 to 35 images, the first is the cover unless platformSpecific.tiktok.photoCoverIndex says otherwise). On Instagram, `collaborators` co-author the whole carousel.\n" +
      "Write a caption, show me the order and text, and on my OK call create_post with mediaFileIds.",
  },
  {
    name: "poll_post",
    title: "Run a poll",
    description: "Post a native poll on X, LinkedIn, Threads, Mastodon, Discord or Telegram.",
    requires: ["list_channels", "create_post"],
    args: {
      question: { description: "The poll question.", required: true },
      options: { description: "The answers, comma-separated.", required: true },
    },
    text: (a) =>
      "Create a poll." +
      given("Question", a.question) +
      given("Options", a.options) +
      "\nCall list_channels. Native polls exist on these platforms, each with its own limits; trim the answers to fit and tell me where they were shortened:\n" +
      "- X: platformSpecific.x.poll = { options: 2 to 4, each 1 to 25 characters, durationMinutes 5 to 10080 }; no media or quote. The question is the post text.\n" +
      "- LinkedIn: postTypeOverrides.linkedin 'poll' and platformSpecific.linkedin.poll = { question up to 140, options 2 to 4 up to 30, duration ONE_DAY | THREE_DAYS | SEVEN_DAYS | FOURTEEN_DAYS }; needs post text, no media.\n" +
      "- Threads: platformSpecific.threads.pollOptions, 2 to 4, each 1 to 25 characters; text posts only.\n" +
      "- Mastodon: platformSpecific.mastodon.poll = { options 2 to 4 up to 50, expiresIn 300 to 2629746 seconds }; no media.\n" +
      "- Discord: platformSpecific.discord[<channelId>].poll = { question up to 300, answers 2 to 10 up to 55, durationHours 1 to 768 } (the bot needs the Send Polls permission).\n" +
      "- Telegram: platformSpecific.telegram[<channelId>].poll = { question 1 to 300, options 2 to 12 up to 100 }.\n" +
      "Other platforms get the question as plain text. Show me the plan and on my OK call create_post.",
  },
  {
    name: "repost_or_quote",
    title: "Repost, quote or reshare",
    description: "Repost or quote an existing post on X, Bluesky, Threads or Mastodon, reshare on LinkedIn, or reblog on Tumblr.",
    requires: ["list_channels", "create_post"],
    args: {
      link: { description: "Link or ID of the post to repost or quote.", required: true },
      comment: { description: "Your own text, for a quote (optional)." },
    },
    text: (a) =>
      "Repost or quote a post." +
      given("Post", a.link) +
      given("Comment", a.comment) +
      "\nCall list_channels and use the account on the same platform as the link. Without a comment it is a repost; with one, a quote:\n" +
      "- X: repost = postTypeOverrides.x 'repost' + platformSpecific.x.repostId; quote = platformSpecific.x.quoteId (no poll).\n" +
      "- Bluesky: repost = postTypeOverrides.bluesky 'repost' + repostId (bsky.app link or at:// URI); quote = quoteId.\n" +
      "- Threads: repost = postTypeOverrides.threads 'repost' + repostId (the numeric post ID, not a link); quote = quotePostId.\n" +
      "- Mastodon: boost = postTypeOverrides.mastodon 'repost' + repostId; quote = quoteId (server on Mastodon 4.5 or later).\n" +
      "- LinkedIn: postTypeOverrides.linkedin 'reshare' + platformSpecific.linkedin.reshareId (post link or urn:li:share / urn:li:ugcPost; activity links cannot be reshared); the comment is optional.\n" +
      "- Tumblr: platformSpecific.tumblr[<channelId>].reblogUrl, with the comment as the post text.\n" +
      "Show me what will be posted and on my OK call create_post (scheduled or draft).",
  },
  {
    name: "story_post",
    title: "Post a story",
    description: "Post an image or short video as an Instagram, Facebook or Snapchat story.",
    requires: ["list_channels", "upload_media", "create_post"],
    args: { media: { description: "Link to the image or video, or say it is attached.", required: true } },
    text: (a, ctx) =>
      "Post a story." +
      given("Media", a.media) +
      "\n" + mediaSources(ctx) +
      "\nCall list_channels. Set postTypeOverrides: instagram 'story', facebook 'story', snapchat 'story' (or 'saved_story' with a title up to 45 characters). Story videos run 3s to 60s on Instagram and Facebook and 5s to 60s on Snapchat; a Snapchat story does not send the caption. " +
      "Confirm, then call create_post with status 'scheduled' and a time" +
      (ctx.has("publish_post") ? ", or create it as a draft and publish it right away with publish_post" : "") +
      (ctx.has("publish_story") ? ". To send an existing post's first media file as an Instagram or Facebook story right away, publish_story does that (the post must already target that platform)." : "."),
  },
  {
    name: "repeating_post",
    title: "Make a post repeat",
    description: "A post that re-publishes daily, weekly, every two weeks or monthly (evergreen content, reminders).",
    requires: ["list_channels", "create_post"],
    args: {
      topic: { description: "What the repeating post says.", required: true },
      cadence: { description: "How often and when, e.g. 'every Monday 9am'.", required: true },
    },
    text: (a) =>
      "Set up a repeating post." +
      given("Topic", a.topic) +
      given("Cadence", a.cadence) +
      "\n" + TZ +
      "\nCall list_channels. Use create_post with repeatSchedule = { frequency: daily | weekly | biweekly | monthly, daysOfWeek (0 = Sunday … 6 = Saturday) for weekly or biweekly, dayOfMonth for monthly, timeOfDay 'HH:MM', timezone }, plus status 'scheduled' and a first scheduledAt. " +
      "Media on a repeating post is always kept in the library. Show me the cadence in plain words (e.g. 'every Monday and Thursday at 09:00 New York time') and wait for my yes.",
  },
  {
    name: "auto_engagement_boost",
    title: "Auto follow-up comment or repost",
    description: "Post a follow-up comment, or repost automatically, once a post reaches a number of likes.",
    requires: ["list_channels", "create_post"],
    args: {
      topic: { description: "The post itself.", required: true },
      followUp: { description: "The follow-up comment text (optional)." },
    },
    text: (a) =>
      "Create a post that boosts itself." +
      given("Post", a.topic) +
      given("Follow-up comment", a.followUp) +
      "\nOn create_post: autoPlugEnabled true with autoPlugText and autoPlugThreshold (likes needed, default 50) posts the follow-up comment; autoRepostEnabled true with autoRepostThreshold (default 100) reposts it. " +
      "Ask me which I want and the thresholds, call list_channels, show me the whole setup and on my OK call create_post.",
  },
  {
    name: "tracked_links_post",
    title: "Post with tracked links",
    description: "Shorten the links in a post and count their clicks, or force links to publish as written.",
    requires: ["list_channels", "create_post"],
    args: { topic: { description: "The post, including its link.", required: true } },
    text: (a) =>
      "Create a post with link tracking." +
      given("Post", a.topic) +
      "\nSet linkTrackingOverride on create_post: true shortens the links and counts clicks, false publishes them as written, omitted follows the workspace setting. Shortening happens at publish time per channel and is skipped where it would push a post past the platform's limit (a short link is 28 characters). Short links are on the Pro and Business plans; on Free links always publish as written. " +
      "Call list_channels, confirm the post with me, then create it. Clicks show up as `linkClicks` in get_post_metrics after it publishes.",
  },
  {
    name: "submit_for_approval",
    title: "Submit a post for approval",
    description: "Schedule a post that waits for a teammate to approve it before publishing.",
    requires: ["list_channels", "create_post"],
    args: {
      topic: { description: "The post.", required: true },
      when: { description: "When it should go out (optional; 'now' publishes as soon as approved)." },
    },
    text: (a) =>
      "Submit a post for team approval." +
      given("Post", a.topic) +
      given("When", a.when) +
      "\n" + TZ +
      "\nCall list_channels, write the post, and on my OK call create_post with status 'scheduled', scheduledAt, and requestApproval true. If I want it out as soon as it is approved (even after its time), also set publishWhenApproved true; for 'now', use the current time as scheduledAt. " +
      "Tell me it is waiting for approval and that a contributor's posts always wait, whatever the flag says.",
  },

  // ======== Managing posts ========
  {
    name: "upcoming_posts",
    title: "What's scheduled next?",
    description: "Everything going out in a date range, soonest first, with gaps and clashes flagged.",
    requires: ["list_posts"],
    args: {
      from: { description: "Start date (optional; defaults to today)." },
      to: { description: "End date (optional; defaults to 7 days from now)." },
    },
    text: (a) =>
      "Show my upcoming schedule." +
      given("From", a.from) +
      given("To", a.to) +
      "\n" + TZ +
      "\nCall list_posts with status 'scheduled', scheduledFrom / scheduledTo for the range and order 'asc' (raise limit or page through if there are many). " +
      "Group by day with times and accounts, and point out empty days, several posts on the same account within an hour, and posts waiting for approval (approvalStatus 'pending'). Change nothing.",
  },
  {
    name: "find_post",
    title: "Find a post",
    description: "Search posts by text, status, account, label or date.",
    requires: ["list_posts", "get_post"],
    args: { query: { description: "Words from the post, or a description of it.", required: true } },
    text: (a, ctx) =>
      "Find a post." +
      given("Looking for", a.query) +
      "\nCall list_posts with `search` for the words (and status, channelId, scheduledFrom / scheduledTo or from / to if I mentioned them" +
      (ctx.has("list_labels") ? "; labelIds from list_labels for a label" : "") +
      "). Show the matches with ID, status, accounts and date, and get_post for the full detail of the one I pick.",
  },
  {
    name: "edit_post",
    title: "Edit a post",
    description: "Change a draft, scheduled, failed or partial post: text, time, media, accounts or labels.",
    requires: ["get_post", "update_post"],
    args: {
      postId: { description: "The post ID (or describe the post).", required: true },
      changes: { description: "What to change.", required: true },
    },
    text: (a, ctx) =>
      "Edit a post." +
      given("Post", a.postId) +
      given("Change", a.changes) +
      "\nCall get_post first" + (ctx.has("list_posts") ? " (if I described the post instead of giving an ID, find it with list_posts)" : "") + ". Only draft, scheduled, failed and partial posts can be edited; editing a failed post returns it to draft. " +
      "Show me before and after and wait for my OK, then call update_post with ifUnmodifiedSince set to the updatedAt you read, so a teammate's newer edit is not overwritten (on a 409, reload and show me again).\n" +
      "Notes: platformContent is replaced as a whole, so send every platform's version you want to keep. mediaFileIds and labelIds replace the old lists. To change accounts send `channels` with the COMPLETE list to keep; an account the post has already gone out on cannot be removed.",
  },
  {
    name: "reschedule_post",
    title: "Reschedule a post",
    description: "Move a post to a new time, or to the top or bottom of the queue.",
    requires: ["get_post", "update_post", "get_queue_slot"],
    args: {
      postId: { description: "The post ID.", required: true },
      when: { description: "New time, or 'top' / 'bottom' of the queue.", required: true },
    },
    text: (a) =>
      "Reschedule a post." +
      given("Post", a.postId) +
      given("When", a.when) +
      "\n" + TZ +
      "\nCall get_post. For the top of the queue call get_queue_slot with position 'next' and excludePostId set to this post; for the bottom use position 'end'. Otherwise convert my time to ISO 8601 (it must be in the future). " +
      "Confirm the new time with me, then update_post with scheduledAt, timezone, status 'scheduled' and ifUnmodifiedSince. Rescheduling a post that waits for approval clears its publish-when-approved flag.",
  },
  {
    name: "change_post_accounts",
    title: "Add or remove accounts on a post",
    description: "Add accounts to a post or drop some, keeping the rest as they are.",
    requires: ["get_post", "update_post", "list_channels"],
    args: {
      postId: { description: "The post ID.", required: true },
      change: { description: "Which accounts to add or remove.", required: true },
    },
    text: (a) =>
      "Change which accounts a post goes to." +
      given("Post", a.postId) +
      given("Change", a.change) +
      "\nCall get_post for its current channels and list_channels for the others. Build the COMPLETE list the post should keep (not a diff): accounts left out are dropped, new ones are added as pending, kept ones keep their state, and an account it already published to must stay. " +
      "Check the media rules for any added platform. Show me the final list and on my OK call update_post with `channels` and ifUnmodifiedSince.\n" +
      MEDIA_RULES,
  },
  {
    name: "unschedule_post",
    title: "Unschedule a post",
    description: "Take a scheduled post off the calendar and keep it as a draft.",
    requires: ["get_post", "update_post"],
    args: { postId: { description: "The post ID.", required: true } },
    text: (a) =>
      "Unschedule a post." +
      given("Post", a.postId) +
      "\nCall get_post, confirm it is the right one, then update_post with status 'draft' and ifUnmodifiedSince. Nothing is deleted; it can be scheduled again later.",
  },
  {
    name: "delete_posts",
    title: "Delete draft or failed posts",
    description: "Clean up drafts and failed posts you no longer need.",
    requires: ["list_posts", "delete_post"],
    args: { which: { description: "Which posts (e.g. 'old drafts', 'failed posts from last month', or IDs)." } },
    text: (a, ctx) =>
      "Clean up posts." +
      given("Which", a.which) +
      "\nOnly draft and failed posts can be deleted; published posts stay on the platforms and cannot be removed from here. " +
      "Find candidates with list_posts (status 'draft' or 'failed'), show me the list with IDs and first lines, and wait for an explicit yes. Deleting is permanent. Then call delete_post for each" +
      (ctx.has("bulk_posts") ? " (or bulk_posts with action 'delete' for up to 100 at a time)." : "."),
  },
  {
    name: "fix_failed_posts",
    title: "Fix failed posts",
    description: "Find posts that failed or partly failed, explain why, and retry the right ones safely.",
    requires: ["list_posts", "get_post", "retry_post", "list_channels"],
    text: (_a, ctx) =>
      "Find and fix posts that did not publish.\n" +
      "1. Call list_posts with status 'failed', then 'partial'. For each, call get_post and read each platform's status and error message.\n" +
      "2. Group the causes: a disconnected account (check list_channels; it must be reconnected on the Channels page of the BulkPublish app first), media the platform rejected (wrong type or length), text over the limit, or a temporary platform error.\n" +
      (ctx.has("update_post") ? "3. For fixable content, propose an update_post (editing a failed post returns it to draft; schedule it again after).\n" : "3. Content problems have to be fixed by editing the post in the BulkPublish app.\n") +
      "4. retry_post re-sends only the platforms that failed. A platform marked 'unconfirmed' may already be live: ask me to check the account, and only pass republish true once I confirm it is NOT there, or it will be posted twice.\n" +
      (ctx.has("bulk_posts") ? "For many posts with a temporary error, bulk_posts with action 'retry' takes up to 100 IDs per call.\n" : "") +
      "Show me the plan and wait for my yes before retrying anything.",
  },
  {
    name: "posts_dashboard",
    title: "Open the posts dashboard",
    description: "An interactive list of posts with status, schedule and accounts.",
    requires: ["view_posts"],
    args: { status: { description: "draft, scheduled, publishing, published, failed or partial (optional)." } },
    text: (a) =>
      "Open my posts with view_posts" + (a.status?.trim() ? ` filtered to status '${a.status.trim()}'` : "") + ".",
  },
  {
    name: "my_assigned_posts",
    title: "Posts assigned to me",
    description: "Posts a teammate has handed to you, and what each one needs.",
    requires: ["list_posts", "get_post"],
    text: () =>
      "Call list_posts with assignedTo 'me' and summarise each post: status, accounts, scheduled time, whether it waits for approval or was rejected (with the reason from get_post). Suggest what I should do on each. Change nothing.",
  },
  {
    name: "posts_by_label",
    title: "Posts by label or campaign",
    description: "List posts carrying one or more labels, e.g. one campaign.",
    requires: ["list_labels", "list_posts"],
    args: { labels: { description: "Label names.", required: true } },
    text: (a) =>
      "Show posts by label." +
      given("Labels", a.labels) +
      "\nCall list_labels (type 'post') to get the IDs, then list_posts with labelIds and labelMode 'or' (any of them) or 'and' (all of them, if I asked for that). Group the results by status.",
  },

  // ======== Approvals ========
  {
    name: "approval_queue",
    title: "Review the approval queue",
    description: "Go through posts waiting for approval and approve or reject each one.",
    requires: ["list_posts", "get_post", "approve_post", "reject_post"],
    text: () =>
      "Walk me through posts waiting for approval.\n" +
      "Call list_posts with approvalStatus 'pending' and order 'asc'. For each, call get_post and show the text per platform, media, accounts and scheduled time, then ask me: approve, reject (with a reason), or skip.\n" +
      "- approve_post: pass ifUnmodifiedSince = the updatedAt you showed me, so an edit made since is not approved unseen. If the scheduled time passed more than 15 minutes ago, ask whether to publish now (whenLate 'publish') or send it back to the author for a new time (whenLate 'hold').\n" +
      "- reject_post: pass my reason (up to 2000 characters) and ifUnmodifiedSince. It returns to the author as a draft.\n" +
      "On a 409 the post changed: reload and show me again. Approving needs the owner, admin or approver role.",
  },
  {
    name: "resubmit_rejected",
    title: "Fix and resubmit rejected posts",
    description: "Read why posts were rejected, revise them, and send them back for approval.",
    requires: ["list_posts", "get_post", "update_post"],
    text: () =>
      "Call list_posts with approvalStatus 'rejected'. For each, call get_post and show me the reviewer's reason next to the text. Propose a revision that addresses it; on my OK, update_post with the new text, a future scheduledAt, status 'scheduled', requestApproval true and ifUnmodifiedSince, which sends it back for approval.",
  },

  // ======== Analytics ========
  {
    name: "performance_report",
    title: "Performance report",
    description: "Posting activity and results over a date range, optionally compared with the period before.",
    requires: ["get_analytics"],
    args: {
      from: { description: "Start date (YYYY-MM-DD).", required: true },
      to: { description: "End date (YYYY-MM-DD).", required: true },
    },
    text: (a) =>
      "Write a performance report." +
      given("From", a.from) +
      given("To", a.to) +
      "\n" + TZ +
      "\nCall get_analytics with from, to and tz. If the window is 15 days or fewer, also pass compare true and show the change against the previous equal window (comparison is not available for longer windows). " +
      "Report totals, published / failed / scheduled counts, per-platform figures and the busiest days, then three takeaways. A metric a platform does not report is unavailable, not zero.",
  },
  {
    name: "weekly_report",
    title: "Weekly report",
    description: "The last 7 days compared with the 7 before, with highlights.",
    requires: ["get_analytics", "list_posts", "get_post_metrics"],
    text: () =>
      "Write my weekly social report.\n" + TZ +
      "\n1. get_analytics for the last 7 days with compare true and my timezone.\n" +
      "2. list_posts with status 'published' and from / to for the same week; call get_post_metrics on up to 10 of them and pick the best and weakest.\n" +
      "3. Report what changed week over week, the top posts with their figures, and two things to try next week.\n" +
      "Only use the metrics in each platform's `supportedMetrics`; anything else is unavailable, not zero.",
  },
  {
    name: "post_performance",
    title: "How did this post do?",
    description: "Likes, comments, shares, views and link clicks for one post, per platform.",
    requires: ["get_post_metrics", "get_post"],
    args: { postId: { description: "The post ID (or describe it).", required: true } },
    text: (a, ctx) =>
      "Report how a post performed." +
      given("Post", a.postId) +
      "\nCall get_post" + (ctx.has("list_posts") ? " (find it with list_posts if I described it)" : "") + " and get_post_metrics. For each platform report only the metrics in its `supportedMetrics`; a metric outside that list is unavailable on that platform, not zero. " +
      "Report `linkClicks` (clicks on its tracked short links, measured by BulkPublish) separately from the platform's own `clicks`, and never add the two. If `metricsSupported` is false, say the platform reports nothing readable (on X, metrics sync has to be on for the channel).",
  },
  {
    name: "top_posts",
    title: "Top posts",
    description: "Rank recent published posts by engagement.",
    requires: ["list_posts", "get_post_metrics"],
    args: {
      from: { description: "Start date (optional; defaults to 30 days ago)." },
      to: { description: "End date (optional)." },
      metric: { description: "What to rank by, e.g. likes, comments, impressions (optional)." },
    },
    text: (a) =>
      "Rank my best posts." +
      given("From", a.from) +
      given("To", a.to) +
      given("Metric", a.metric) +
      "\nCall list_posts with status 'published' and from / to, then get_post_metrics for each (keep it to about 20 posts; tell me if there were more). " +
      "Rank by the metric I named, or by total engagement. Compare like with like: only rank a platform on metrics in its `supportedMetrics`. Show the top 5 and what they have in common (format, length, media, timing).",
  },
  {
    name: "platform_comparison",
    title: "Compare platforms",
    description: "Which networks get the most out of your posting.",
    requires: ["get_analytics"],
    args: {
      from: { description: "Start date.", required: true },
      to: { description: "End date.", required: true },
    },
    text: (a) =>
      "Compare my platforms." +
      given("From", a.from) +
      given("To", a.to) +
      "\nCall get_analytics for the range with my timezone and compare the per-platform figures. Then call it once per platform with `platforms` set (e.g. 'x') if you need that platform's daily pattern. Say where effort pays off most and where posts fail most often.",
  },
  {
    name: "content_type_analysis",
    title: "What content works best?",
    description: "Compare text-only, image and video posts, and single posts against threads.",
    requires: ["get_analytics"],
    args: {
      from: { description: "Start date.", required: true },
      to: { description: "End date.", required: true },
    },
    text: (a) =>
      "Compare content types." +
      given("From", a.from) +
      given("To", a.to) +
      "\nCall get_analytics for the range three times with mediaType 'text', 'image' and 'video', then twice with postFormat 'post' and 'thread'. Put the figures side by side and recommend a content mix.",
  },
  {
    name: "campaign_report",
    title: "Campaign report by label",
    description: "Results for the posts carrying a campaign label.",
    requires: ["list_labels", "get_analytics", "list_posts"],
    args: {
      label: { description: "The campaign label.", required: true },
      from: { description: "Start date.", required: true },
      to: { description: "End date.", required: true },
    },
    text: (a, ctx) =>
      "Report on a campaign." +
      given("Label", a.label) +
      given("From", a.from) +
      given("To", a.to) +
      "\nCall list_labels to get the label ID. Call get_analytics with labelIds set to it, then list_posts with labelIds and status 'published'" +
      (ctx.has("get_post_metrics") ? ", and get_post_metrics on those posts (up to about 20)" : "") +
      ". Report reach and engagement for the campaign and its best posts.",
  },
  {
    name: "link_click_report",
    title: "Link click report",
    description: "Clicks on the tracked short links in your recent posts.",
    requires: ["list_posts", "get_post_metrics"],
    args: { from: { description: "Start date (optional; defaults to 30 days ago)." } },
    text: (a) =>
      "Report link clicks." +
      given("From", a.from) +
      "\nCall list_posts with status 'published' (and `from` if given), then get_post_metrics for each (about 20 at most). Read `linkClicks` per platform and `totals.linkClicks`: clicks measured by BulkPublish on tracked short links, with bot and link-preview traffic removed. " +
      "Rank posts by clicks. It is 0 when the workspace has link tracking off; say so rather than reporting no interest.",
  },
  {
    name: "analytics_dashboard",
    title: "Open the analytics dashboard",
    description: "Interactive charts for a date range.",
    requires: ["view_analytics"],
    args: {
      from: { description: "Start date (optional; defaults to 30 days ago)." },
      to: { description: "End date (optional; defaults to today)." },
    },
    text: (a) =>
      "Open the analytics dashboard with view_analytics" +
      (a.from?.trim() ? ` from ${a.from.trim()}` : "") +
      (a.to?.trim() ? ` to ${a.to.trim()}` : "") +
      ".",
  },
  {
    name: "x_sync_settings",
    title: "Turn X analytics or Inbox sync on or off",
    description: "Choose whether BulkPublish reads analytics, likers, messages and replies for an X account.",
    requires: ["list_channels", "update_channel"],
    text: () =>
      "Help me set X sync.\nCall list_channels and show my X accounts. For each, explain the two switches before changing anything: metricsSyncEnabled reads post analytics (at most once every 7 days) and the list of people who liked a post; inboxSyncEnabled reads direct messages and replies. Both are off by default because every X read is billed. " +
      "On my choice, call update_channel with only the switches I want changed. It needs the owner, admin or approver role and changes nothing on other platforms.",
  },

  // ======== Comments and Inbox ========
  {
    name: "read_post_comments",
    title: "Read comments on a post",
    description: "Who commented and reacted on one of your published posts, per platform.",
    requires: ["list_post_comments"],
    args: { postId: { description: "The post ID (or describe it).", required: true } },
    text: (a, ctx) =>
      "Show the comments on a post." +
      given("Post", a.postId) +
      "\nCall list_post_comments" +
      (ctx.has("list_posts") ? " (find the post with list_posts first if I described it)" : "") +
      ". Summarise per platform: number of comments, overall sentiment, questions that need an answer, and anything that looks like spam or abuse. TikTok, Pinterest, Google Business, Telegram and Snapchat have no comment access and say so." +
      (ctx.has("reply_to_comment") ? " Offer to draft replies (I will approve each one)." : " Change nothing."),
  },
  {
    name: "reply_to_comments",
    title: "Reply to comments",
    description: "Draft replies to comments on a published post and post the ones you approve.",
    requires: ["list_post_comments", "reply_to_comment"],
    args: {
      postId: { description: "The post ID.", required: true },
      tone: { description: "How replies should sound (optional)." },
    },
    text: (a) =>
      "Reply to comments on a post." +
      given("Post", a.postId) +
      given("Tone", a.tone) +
      "\nCall list_post_comments. Draft a reply for each comment worth answering (up to 2,000 characters each) and show them to me. " +
      "Replies are public and cannot be taken back from here, so post only the ones I approve, one reply_to_comment per comment with its postPlatformId and commentId (and rootCommentId when answering a reply on Instagram or YouTube). " +
      "If a call is refused because the channel needs reconnecting or the plan does not include replies, tell me and stop.",
  },
  {
    name: "moderate_comments",
    title: "Moderate comments",
    description: "Find spam or abusive comments on a post and hide, delete or like them.",
    requires: ["list_post_comments", "moderate_comment"],
    args: { postId: { description: "The post ID.", required: true } },
    text: (a) =>
      "Moderate comments on a post." +
      given("Post", a.postId) +
      "\nCall list_post_comments. Flag spam, abuse and off-topic comments, and good ones worth a like. Each channel's `commentActions` lists what it supports (Threads: hide and unhide; Facebook: hide, unhide and delete). " +
      "Propose an action per comment and wait for my OK. Hiding and likes can be undone; delete is permanent and needs a role that can publish. Then call moderate_comment for each.",
  },
  {
    name: "inbox_triage",
    title: "Triage the Inbox",
    description: "Sort unread messages, reviews and comment threads by urgency, and tidy them up.",
    requires: ["list_conversations", "get_conversation", "update_conversation"],
    text: (_a, ctx) =>
      "Triage my Inbox.\n" +
      "1. Call list_conversations (status 'open'; page with nextCursor) and focus on those with unread messages.\n" +
      "2. Read the important ones with get_conversation (reading does not mark them read).\n" +
      "3. Sort into: needs a reply now, can wait, no action needed, spam. For direct messages check `canReply` and `replyNotice`: Facebook Messenger and Instagram only accept a reply within 24 hours of the person's last message.\n" +
      "4. Propose actions and, on my OK, apply them with update_conversation: mark read, archive, snooze (up to 90 days), or assign to a teammate (who is notified).\n" +
      (ctx.has("reply_to_conversation") ? "5. Draft replies for the urgent ones and send only those I approve, with reply_to_conversation.\n" : "") +
      "The Inbox is part of the Pro and Business plans; if the call is refused, say so.",
  },
  {
    name: "reply_to_messages",
    title: "Answer direct messages",
    description: "Draft replies to unanswered direct messages and send the ones you approve.",
    requires: ["list_conversations", "get_conversation", "reply_to_conversation"],
    args: { tone: { description: "How replies should sound (optional)." } },
    text: (a) =>
      "Answer my direct messages." +
      given("Tone", a.tone) +
      "\nCall list_conversations with kind 'dm' and status 'open'. Skip any whose `canReply` is false and tell me why from `replyNotice` (Messenger and Instagram allow replies only within 24 hours of the person's last message). " +
      "Read each with get_conversation, draft a reply (up to 4,000 characters; up to 4 media library files can be attached to a direct message) and show it to me. Messages cannot be unsent, so send only what I approve, with reply_to_conversation.",
  },
  {
    name: "respond_to_reviews",
    title: "Respond to reviews",
    description: "Draft thoughtful responses to customer reviews and post the ones you approve.",
    requires: ["list_conversations", "get_conversation", "reply_to_conversation"],
    text: () =>
      "Respond to my reviews.\nCall list_conversations with kind 'review'. Read each with get_conversation. Draft a response: thank happy customers, and for unhappy ones acknowledge the problem and offer a way to resolve it, without arguing. Reviews take text only. " +
      "Show me every draft; post only those I approve with reply_to_conversation, since a response is public and cannot be unsent.",
  },
  {
    name: "inbox_search",
    title: "Search the Inbox",
    description: "Find conversations by a person's name, handle or words in the messages.",
    requires: ["list_conversations", "get_conversation"],
    args: { query: { description: "Name, handle or words to find (2 to 100 characters).", required: true } },
    text: (a) =>
      "Search my Inbox." +
      given("Query", a.query) +
      "\nCall list_conversations with q set to the query, across open, archived and snoozed (one call per status). Show the matches and open the one I pick with get_conversation.",
  },

  // ======== Media ========
  {
    name: "upload_files",
    title: "Upload media",
    description: "Add images, videos or documents to your media library for later posts.",
    requires: ["upload_media"],
    args: { files: { description: "Links to the files, or say they are attached.", required: true } },
    text: (a, ctx) =>
      "Upload files to my media library." +
      given("Files", a.files) +
      "\n" + mediaSources(ctx) +
      "\nUpload each file and report its media ID, type and size." +
      (ctx.has("update_media") ? " Offer to add alt text to images with update_media." : ""),
  },
  {
    name: "large_video_upload",
    title: "Upload a very large video",
    description: "Upload a video over 100MB (up to 1GB) in 10MB chunks. Needs a client that can send HTTP requests itself.",
    requires: ["create_multipart_upload", "complete_multipart_upload", "abort_multipart_upload"],
    args: { file: { description: "The video file and its size in bytes.", required: true } },
    text: (a) =>
      "Upload a large video in chunks." +
      given("File", a.file) +
      "\nThis only works if you can send HTTP PUT requests yourself (for example from a shell); if you cannot, say so and stop.\n" +
      "1. create_multipart_upload with contentType and the exact sizeBytes (videos up to 1GB). It returns a key, an uploadId, a part size of 10MB and one upload URL per part (valid for an hour).\n" +
      "2. PUT each 10MB slice to its URL and keep the ETag response header of each. A failed part can be sent again on its own.\n" +
      "3. complete_multipart_upload with every partNumber and etag, the file name, type and size. It returns the media file to attach to a post.\n" +
      "If the upload has to be abandoned, abort_multipart_upload frees the stored parts (this cannot be undone).",
  },
  {
    name: "media_library_browse",
    title: "Browse the media library",
    description: "Open an interactive gallery of your uploaded media.",
    requires: ["view_media"],
    text: () => "Open my media library with view_media.",
  },
  {
    name: "alt_text_audit",
    title: "Add missing alt text",
    description: "Find images without alt text and write descriptions for them.",
    requires: ["list_media", "update_media"],
    text: () =>
      "Make my images accessible.\nCall list_media with type 'image' (page through all of them) and find files without alt text. For each, look at the image if you can see it, or ask me, and write a concise description (up to 1000 characters) of what matters in it. " +
      "Show me the list and on my OK set each with update_media. Alt text belongs to the file, so it covers every post that reuses it, and is sent to Instagram, LinkedIn, X, Bluesky, Tumblr and Discord.",
  },
  {
    name: "media_cleanup",
    title: "Clean up the media library",
    description: "Find files you no longer need and delete them, without breaking scheduled posts.",
    requires: ["list_media", "delete_media"],
    text: (_a, ctx) =>
      "Help me clean up my media library.\nCall list_media (page through it) and group files by type and age. " +
      (ctx.has("list_posts") ? "Check list_posts for scheduled and draft posts and keep any file they use: an unpublished post whose media is deleted will fail to publish. " : "An unpublished post whose media is deleted will fail to publish, so ask me before removing anything recent. ") +
      (ctx.has("get_quota_usage") ? "Use get_quota_usage to show how much storage this frees. " : "") +
      "Show me what you propose to delete and wait for an explicit yes; deleting is permanent. Then call delete_media for each.",
  },

  // ======== Organising ========
  {
    name: "manage_labels",
    title: "Organise labels",
    description: "Create, rename, recolour or delete the labels you tag posts and media with.",
    requires: ["list_labels", "create_label", "update_label", "delete_label"],
    args: { goal: { description: "What you want, e.g. 'a label per client' (optional)." } },
    text: (a) =>
      "Help me organise labels." +
      given("Goal", a.goal) +
      "\nCall list_labels. Suggest a tidy set (type 'post' for posts, 'media' for media files; colour as hex). Show me the changes, and on my OK use create_label, update_label and delete_label. Deleting a label removes it from every post or file that carries it.",
  },
  {
    name: "hashtag_groups",
    title: "Build hashtag groups",
    description: "Research and save reusable hashtag sets, or add a saved set to a post.",
    requires: ["list_hashtag_groups", "create_hashtag_group", "update_hashtag_group"],
    args: { topic: { description: "The niche or campaign (optional)." } },
    text: (a, ctx) =>
      "Help me with hashtag groups." +
      given("Topic", a.topic) +
      "\nCall list_hashtag_groups to see what exists. Propose new groups or changes (1 to 30 hashtags each; letters, digits and underscores only; names unique; up to 100 groups). On my OK use create_hashtag_group or update_hashtag_group." +
      (ctx.has("update_post") ? " To use a group on a post, append its hashtags to the post text with update_post." : ""),
  },
  {
    name: "caption_templates",
    title: "Save caption templates",
    description: "Save reusable caption and first-comment text, or start a post from a saved template.",
    requires: ["list_templates", "create_template", "update_template"],
    args: { purpose: { description: "What the template is for (optional)." } },
    text: (a, ctx) =>
      "Help me with saved templates." +
      given("Purpose", a.purpose) +
      "\nCall list_templates (kind 'caption', and kind 'first_comment' for first-comment snippets). Draft new templates or improvements (text only, up to 10,000 characters; up to 200 per kind; names unique per kind) and on my OK save them with create_template or update_template." +
      (ctx.has("create_post") ? " To start a post from a caption template, use its text as the content in create_post." : ""),
  },
  {
    name: "calendar_notes",
    title: "Mark dates on the content calendar",
    description: "Pin campaigns, holidays and blackout days to the calendar. Notes never publish.",
    requires: ["list_calendar_notes", "create_calendar_note"],
    args: {
      period: { description: "Which dates, e.g. 'next month' or 'Q1'.", required: true },
      notes: { description: "What to mark (optional; I can suggest holidays and campaign dates)." },
    },
    text: (a, ctx) =>
      "Add notes to my content calendar." +
      given("Period", a.period) +
      given("Notes", a.notes) +
      "\nCall list_calendar_notes for the range (YYYY-MM-DD, at most a year) to avoid duplicates. Propose notes (date, text up to 2000 characters, optional hex colour) and on my OK create each with create_calendar_note. Notes are only reminders; nothing is published." +
      (ctx.has("update_calendar_note") ? " Existing notes can be moved or reworded with update_calendar_note" + (ctx.has("delete_calendar_note") ? " and removed with delete_calendar_note." : ".") : ""),
  },
  {
    name: "channel_sets",
    title: "Save groups of accounts",
    description: "Save named groups of accounts (e.g. 'All brand accounts', 'Client A') for quick targeting.",
    requires: ["list_channels", "list_channel_sets", "create_channel_set", "update_channel_set"],
    text: () =>
      "Help me group my accounts.\nCall list_channels and list_channel_sets. Suggest useful groups (by brand, client, region or platform). On my OK create them with create_channel_set (names unique, up to 50 sets) or change them with update_channel_set. When I later post to a group, use its channelIds with list_channels to build the post's channel list.",
  },

  // ======== Planning ========
  {
    name: "plan_content_week",
    title: "Plan a week of content",
    description: "A full week of posts across your accounts, saved as drafts or scheduled.",
    requires: ["list_channels", "list_posts", "create_post"],
    args: {
      theme: { description: "Goals, themes or products to cover.", required: true },
      start: { description: "First day of the week (optional; defaults to next Monday)." },
    },
    text: (a, ctx) =>
      "Plan a week of social content." +
      given("Theme", a.theme) +
      given("Start", a.start) +
      "\n" + TZ +
      "\n1. Call list_channels, and list_posts with status 'scheduled' for that week so nothing clashes.\n" +
      (ctx.has("get_analytics") ? "2. Look at get_analytics for the last 30 days to see which platforms and days work.\n" : "") +
      "3. Propose a table: day, time, accounts, format, hook. Vary formats (text, image, video, thread, poll) to what each platform takes.\n" +
      "4. On my OK, write each post and create it with create_post: as drafts by default, or scheduled if I say so.\n" +
      (ctx.has("create_calendar_note") ? "5. Offer to mark the week's theme on the calendar with create_calendar_note.\n" : "") +
      MEDIA_RULES,
  },
  {
    name: "plan_campaign",
    title: "Plan a launch or campaign",
    description: "A multi-week campaign: teaser, launch and follow-up posts, labelled so you can report on it.",
    requires: ["list_channels", "create_post", "list_labels"],
    args: {
      campaign: { description: "What is launching, and the key date.", required: true },
    },
    text: (a, ctx) =>
      "Plan a campaign." +
      given("Campaign", a.campaign) +
      "\n" + TZ +
      "\nCall list_channels and list_labels. " +
      (ctx.has("create_label") ? "Create a campaign label with create_label if none fits. " : "Use an existing label for the campaign if one fits. ") +
      "Propose a timeline (teasers, launch day across every account, follow-ups and a recap), with the formats each platform suits. On my OK create each post with create_post, tagged with the label, as drafts or scheduled." +
      (ctx.has("create_calendar_note") ? " Mark the launch date with create_calendar_note." : "") +
      (ctx.has("create_review_link") ? " Offer a client review link for the whole batch with create_review_link." : "") +
      "\n" + MEDIA_RULES,
  },
  {
    name: "repurpose_content",
    title: "Repurpose long content",
    description: "Turn an article, video script or newsletter into a set of posts and threads.",
    requires: ["list_channels", "create_post"],
    args: { source: { description: "The article text, script or a summary of it.", required: true } },
    text: (a) =>
      "Repurpose this into social posts." +
      given("Source", a.source) +
      "\nPull out 5 to 10 standalone ideas: quotes, stats, tips, a thread, a poll. Call list_channels and propose which idea goes to which accounts and in which format. On my OK create them with create_post as drafts (or spread over the coming days if I ask).\n" +
      THREAD_RULES,
  },

  // ======== Automation ========
  {
    name: "recurring_schedule",
    title: "Set up a recurring schedule",
    description: "A rule that creates and publishes a post on a fixed cadence (tips, weekly roundups).",
    requires: ["list_channels", "list_schedules", "create_schedule"],
    args: {
      content: { description: "What each post says.", required: true },
      cadence: { description: "How often and when.", required: true },
    },
    text: (a) =>
      "Set up a recurring schedule." +
      given("Content", a.content) +
      given("Cadence", a.cadence) +
      "\n" + TZ +
      "\nCall list_channels and list_schedules (to avoid duplicates). create_schedule takes name, channelIds, frequency (daily, weekly, biweekly, monthly), timeOfDay 'HH:MM', dayOfWeek (0 = Sunday) for weekly or biweekly, dayOfMonth for monthly, contentTemplate, mediaFileIds, timezone, and requireApproval to hold every post for approval. " +
      "Describe the schedule in plain words and wait for my yes. It also appears on the Repeat Posts page of the app.",
  },
  {
    name: "manage_schedules",
    title: "Review recurring schedules",
    description: "See every recurring schedule, then pause, change or delete them.",
    requires: ["list_schedules", "update_schedule"],
    text: (_a, ctx) =>
      "Review my recurring schedules.\nCall list_schedules and show each: name, cadence in plain words, accounts, active or paused, and next run. Ask what to change. " +
      "Pause or resume with update_schedule isActive; change timing, text or media with update_schedule" +
      (ctx.has("delete_schedule") ? "; delete_schedule stops it for good (posts it already made stay)" : "") +
      ". Confirm each change first.",
  },
  {
    name: "rss_autopost",
    title: "Auto-post from an RSS feed",
    description: "Turn new blog or news items into posts automatically, as drafts or published.",
    requires: ["list_channels", "list_rss_feeds", "create_rss_feed"],
    args: {
      feedUrl: { description: "The RSS or Atom feed URL.", required: true },
    },
    text: (a) =>
      "Set up RSS auto-posting." +
      given("Feed", a.feedUrl) +
      "\nCall list_rss_feeds (up to 20 per workspace) and list_channels. Explain the choices, then create_rss_feed with name, feedUrl, channelIds and:\n" +
      "- mode 'draft' (new items wait for review; the default) or 'publish' (posted automatically; requireApproval true holds each for a teammate).\n" +
      "- fieldMapping: template (default '{title}\\n\\n{link}'; tokens {title} {link} {description} {content} {author} {categories} {feedName}), mediaField (none, image, video, auto), articleImage (when_needed, always, never) to borrow the article's picture for image-only platforms, stripHtml, truncate (smart, hard, skip), hashtags, and channelOverrides per account.\n" +
      "The feed is checked every 15 minutes; the server refuses a URL that is not a reachable public feed. Video-only platforms (TikTok, YouTube) are skipped for items with no video. Confirm the setup with me before creating it.",
  },
  {
    name: "rss_feed_troubleshoot",
    title: "Fix or pause RSS feeds",
    description: "Check every RSS feed for errors, and pause, re-point or remove them.",
    requires: ["list_rss_feeds", "update_rss_feed"],
    text: (_a, ctx) =>
      "Check my RSS feeds.\nCall list_rss_feeds and report each feed's last check time and `lastError`. Explain likely causes and propose fixes: update_rss_feed with enabled false to pause, a new feedUrl (only items published after the change are posted, so the new feed's backlog is not flooded), new channels or mapping (fieldMapping null resets it)" +
      (ctx.has("delete_rss_feed") ? ", or delete_rss_feed to stop for good (posts already made stay)" : "") +
      ". Confirm each change.",
  },

  // ======== Clients and agencies ========
  {
    name: "client_review_link",
    title: "Send posts to a client for review",
    description: "A link a client can open without an account to review one post or a whole batch.",
    requires: ["list_posts", "share_post", "create_review_link"],
    args: { which: { description: "Which posts (e.g. 'next week's posts for Acme').", required: true } },
    text: (a) =>
      "Make a client review link." +
      given("Posts", a.which) +
      "\nFind the posts with list_posts (scheduledFrom / scheduledTo, search, labelIds). For one post use share_post (it returns the same link each time unless regenerate true, which kills the old one). For several, create_review_link with up to 50 postIds and an internal `name` the client never sees; each call makes a new link. " +
      "Give me the URL to send; nothing is sent by BulkPublish. Review links are on the Pro and Business plans.",
  },
  {
    name: "revoke_review_links",
    title: "Revoke client review links",
    description: "Stop old review links from working.",
    requires: ["list_review_links", "delete_review_link"],
    text: (_a, ctx) =>
      "Call list_review_links (page while page × limit < total) and show each link's name, post count and age. Ask which to revoke and on my OK call delete_review_link for each; the posts are untouched." +
      (ctx.has("unshare_post") ? " A single post's link is revoked with unshare_post." : ""),
  },
  {
    name: "client_connect_link",
    title: "Let a client connect their account",
    description: "A one-time link a client opens to connect their own social account, without sharing a password or needing a BulkPublish account.",
    requires: ["create_client_connect_link", "list_client_connect_links"],
    args: { client: { description: "Your name for the client (never shown to them).", required: true } },
    text: (a, ctx) =>
      "Create a client connect link." +
      given("Client", a.client) +
      "\nCall list_client_connect_links to see existing links for this client. Then create_client_connect_link with the client's name as your own label. " +
      "Tell me: the link works once and expires in 7 days; the client chooses the platform (Bluesky, Facebook, Instagram, X, TikTok, YouTube, Threads, Pinterest, Google Business, LinkedIn, Mastodon, Discord, Tumblr or Snapchat; a Telegram account has to be connected by your own team); the URL is shown only this once, so save it now." +
      (ctx.has("delete_client_connect_link") ? " An unused link can be revoked with delete_client_connect_link." : "") +
      " Client links are on the Pro and Business plans.",
  },
  {
    name: "client_onboarding",
    title: "Onboard a new client",
    description: "Connect link, account group, label and a first batch of draft posts for a new client.",
    requires: ["create_client_connect_link", "create_label", "create_channel_set", "list_channels", "create_post"],
    args: { client: { description: "Client name and what they do.", required: true } },
    text: (a) =>
      "Onboard a new client." +
      given("Client", a.client) +
      "\n1. create_client_connect_link with the client's name; give me the URL to send (shown only once, valid 7 days, one account per link).\n" +
      "2. create_label for the client, so their posts can be filtered and reported on.\n" +
      "3. Once their accounts appear in list_channels, create_channel_set with them.\n" +
      "4. Draft three to five intro posts with create_post (as drafts, with the label) for the client to review.\n" +
      "Confirm each step before taking it. These features are on the Pro and Business plans.",
  },
];

// ---- Platform prompts ------------------------------------------------------

for (const [key, p] of Object.entries(PLATFORM_GUIDES)) {
  PROMPTS.push({
    name: `post_to_${key}`,
    title: `Post to ${p.label}`,
    description: `Write and schedule a post for ${p.label}, with its post types, settings and limits.`,
    requires: ["list_channels", "create_post"],
    args: {
      topic: { description: "What to post.", required: true },
      when: { description: "When to publish (optional; saved as a draft if empty)." },
    },
    text: (a, ctx) =>
      `Create a ${p.label} post.` +
      given("Topic", a.topic) +
      given("When", a.when) +
      "\n" + TZ +
      `\nCall list_channels and use my ${p.label} account(s) (ask if there are several). ` +
      p.guide(ctx) +
      "\n" + (ctx.has("upload_media") ? mediaSources(ctx) + "\n" : "") +
      "Show me the post and its settings, and on my OK call create_post: status 'draft', or 'scheduled' with scheduledAt and timezone. " +
      "If a value is refused with VALIDATION_ERROR, the message names the field; fix it and try again.",
  });
}

// ---- Registration ----------------------------------------------------------

/** Every prompt definition (for the check script). */
export function allPrompts(): readonly PromptDef[] {
  return PROMPTS;
}

/** Prompts this instance can carry out, given the tools it serves. */
export function servedPrompts(ctx: PromptCtx): PromptDef[] {
  return PROMPTS.filter((p) => p.requires.every(ctx.has));
}

export function registerPrompts(server: McpServer, ctx: PromptCtx): void {
  for (const p of servedPrompts(ctx)) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [k, arg] of Object.entries(p.args ?? {})) {
      shape[k] = arg.required ? z.string().describe(arg.description) : z.string().optional().describe(arg.description);
    }
    server.registerPrompt(
      p.name,
      { title: p.title, description: p.description, argsSchema: shape as never },
      ((args: Record<string, string | undefined>) => ({
        description: p.description,
        messages: [{ role: "user" as const, content: { type: "text" as const, text: p.text(args ?? {}, ctx) + "\n\n" + CONFIRM } }],
      })) as never
    );
  }
}
