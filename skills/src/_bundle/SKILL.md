---
name: BulkPublish
description: Schedule, publish and measure social media posts on 15 networks through BulkPublish, and answer the Inbox. Use whenever the user wants to draft, schedule, publish, retry or review social media posts, plan a content calendar or campaign, upload images or video, look at post analytics, or read and reply to comments, messages and reviews.
example-prompt: Draft a LinkedIn and X post about our new release, show it to me, then schedule it for tomorrow at 9am.
---

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

{{skill-index}}
