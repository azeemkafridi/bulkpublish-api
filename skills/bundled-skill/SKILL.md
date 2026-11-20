---
name: "BulkPublish"
description: "Schedule, publish and measure social media posts on 15 networks through BulkPublish, and answer the Inbox. Use whenever the user wants to draft, schedule, publish, retry or review social media posts, plan a content calendar or campaign, upload images or video, look at post analytics, or read and reply to comments, messages and reviews."
example-prompt: "Draft a LinkedIn and X post about our new release, show it to me, then schedule it for tomorrow at 9am."
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# BulkPublish

BulkPublish schedules and publishes posts to the user's connected social media accounts on 15 networks, reads the results back, and gathers comments, direct messages and reviews into one Inbox. This skill needs the BulkPublish app connected, so its tools are available.

This file covers the rules that apply to every task. Each task has its own guide in `references/`. Read the guide for the task before you call a tool for it, and read `references/platform-reference.md` before you create a post for a network you have not posted to in this conversation.

## Rules for every task

1. **Start with `list_channels`.** It returns the channel IDs every post needs, and a `capabilities` object that says whether the caller may create, publish or approve posts. A read-only connection can only read: say so instead of trying a write.
2. **Draft first.** `create_post` saves a draft unless `status` is `"scheduled"` with a `scheduledAt` time. Show the user the text, the accounts and the time before you schedule anything.
3. **Publishing cannot be undone.** `publish_post` sends a post to the public networks at once. Ask for an explicit yes for that post before you call it, every time. Approval of one post is not approval of the next.
4. **Replies go to real people.** In the Inbox and in comment threads, show the exact reply and who it goes to, and wait for a yes before you send it. Never send replies in bulk.
5. **Media goes up first.** Upload each image or video with `upload_media`, then pass the returned IDs in `mediaFileIds`. Check the file against the network's rules first (`references/media-preflight.md`).
6. **Per-network choices come from the server.** Use `get_channel_options` for Pinterest boards, YouTube playlists and similar lists, rather than guessing an ID.
7. **Results.** Use `get_post` for a post's status on each network, `get_post_metrics` for one post's numbers, and `get_analytics` for totals over time.

## Guides

| Guide | Read it when |
|---|---|
| [`brand-voice-editor`](references/brand-voice-editor.md) | Edit social media content into a consistent brand voice while preserving facts and preparing it for BulkPublish platforms. |
| [`campaign-performance-report`](references/campaign-performance-report.md) | Produce campaign performance reports from BulkPublish analytics with platform-aware metrics, caveats, and recommendations. |
| [`comment-replies`](references/comment-replies.md) | Read the comments on a published BulkPublish post and reply to, like, hide or delete them, with a confirmation before anything is posted or removed. Use when the user asks who commented on a post, wants to answer comments, or wants to clear spam from a post. |
| [`content-repurposing`](references/content-repurposing.md) | Repurpose a source article, newsletter, transcript, or announcement into a coordinated BulkPublish social content package. |
| [`fix-failed-posts`](references/fix-failed-posts.md) | Find BulkPublish posts that failed or only partly published, explain why, and retry the right ones without posting anything twice. Use when the user asks why a post did not go out, about failed or partial posts, or wants to retry. |
| [`get-analytics`](references/get-analytics.md) | Pull analytics, engagement metrics, and performance data from BulkPublish. Use when the user asks about post performance or engagement. |
| [`hashtag-keyword-research`](references/hashtag-keyword-research.md) | Research social media keywords and hashtag sets for campaign content, then prepare BulkPublish-ready platform variants. |
| [`inbox-triage`](references/inbox-triage.md) | Read, sort and answer the BulkPublish Inbox (direct messages, reviews and comment threads) with a confirmation before every reply. Use when the user asks about messages, DMs, reviews, what is waiting for a reply, or wants to clear, snooze, archive or assign conversations. |
| [`influencer-campaign-planner`](references/influencer-campaign-planner.md) | Plan influencer and creator social campaigns with deliverables, usage guidance, disclosure needs, and BulkPublish execution steps. |
| [`link-tracking-review`](references/link-tracking-review.md) | Review social links, BulkPublish link-tracking settings, and tracked-click results without confusing them with platform click metrics. |
| [`manage-channels`](references/manage-channels.md) | List connected social media channels, check what the caller may do with them, and look up platform options such as boards and playlists in BulkPublish. Use when the user asks about their connected accounts. |
| [`manage-scheduled-posts`](references/manage-scheduled-posts.md) | Edit, reschedule, unschedule or delete BulkPublish posts, and add or remove the accounts a post goes to, without overwriting a teammate's changes. Use when the user wants to change a post that already exists. |
| [`media-library`](references/media-library.md) | Upload images and video to BulkPublish and browse the media library, so files can be attached to posts. Use when the user wants to add or find media. |
| [`media-preflight`](references/media-preflight.md) | Preflight social media images and videos against BulkPublish platform, post-type, size, format, aspect-ratio, and duration requirements before publishing. |
| [`platform-content-adapter`](references/platform-content-adapter.md) | Adapt social media content for multiple platforms while preserving the message, voice, and call to action. Use when one source idea needs platform-specific versions. |
| [`platform-reference`](references/platform-reference.md) | Complete reference for the 15 BulkPublish platforms — post types, media requirements, required fields, character limits, and platformSpecific options. ALWAYS consult before creating posts. |
| [`post-approvals`](references/post-approvals.md) | Submit BulkPublish posts for team approval, work through the approval queue as an approver, and fix and resubmit rejected posts. Use when the user mentions approval, review by a teammate, the approval queue, or a rejected post. |
| [`recurring-posts`](references/recurring-posts.md) | Set up and manage BulkPublish posts that repeat on a schedule, daily, weekly, every two weeks or monthly, and pause, change or stop them. Use when the user wants evergreen content, a weekly series or any post that repeats. |
| [`schedule-post`](references/schedule-post.md) | Create, schedule, or publish social media posts via BulkPublish MCP. Use when the user wants to post to social media. |
| [`social-campaign-builder`](references/social-campaign-builder.md) | Build a coordinated social media campaign with post ideas, platform variants, CTAs, media requirements, and an execution-ready BulkPublish plan. |
| [`social-content-audit`](references/social-content-audit.md) | Audit a social media library, calendar, or BulkPublish account for content quality, platform coverage, metadata, and operational risks. |
| [`social-content-strategy`](references/social-content-strategy.md) | Create practical social media content strategies from a business goal, audience, offer, or campaign brief. Use before drafting a sustained cross-platform content plan. |
| [`social-copy-ab-testing`](references/social-copy-ab-testing.md) | Design controlled social copy experiments and publish or schedule test variants through BulkPublish with measurable hypotheses. |
| [`social-localization`](references/social-localization.md) | Localize social media content for language, region, culture, and platform while preparing safe BulkPublish variants. |
| [`social-media-calendar`](references/social-media-calendar.md) | Plan, organize, and schedule a cross-platform social media calendar through BulkPublish. Use when the user wants a posting schedule, queue, or recurring cadence. |
| [`social-post-review`](references/social-post-review.md) | Review social media drafts for clarity, tone, platform fit, compliance risks, character limits, metadata, and publishing readiness before BulkPublish execution. |
| [`social-trend-research`](references/social-trend-research.md) | Research timely social media themes and translate them into safe, relevant BulkPublish content opportunities. |
| [`ugc-content-planner`](references/ugc-content-planner.md) | Plan user-generated-content campaigns and convert approved UGC into compliant, platform-ready BulkPublish posts. |
| [`video-publishing`](references/video-publishing.md) | Publish videos, Reels, Shorts, Spotlight and stories through BulkPublish with the right post type, length and settings for each network. Use when the user wants to post a video, a Reel, a Short or a story. |
