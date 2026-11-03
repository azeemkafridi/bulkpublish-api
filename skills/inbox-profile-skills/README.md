# Inbox-profile skills

<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

Skills that need the Inbox and comment tools, served under the `inbox` profile (`BULKPUBLISH_TOOL_PROFILE=inbox`). Ship them beside `../core-profile-skills` to a connector running that profile, never to one running `core`.

Every file here is generated from `../src`. Edit the source and run `cd mcp-server && npm run build:skills`; `npm run check:skills` fails on a copy that differs, on a tool the profile does not serve, and on a post type or parameter the server does not accept.

| Skill | What it is for |
|---|---|
| [`comment-replies`](comment-replies/SKILL.md) | Read the comments on a published BulkPublish post and reply to, like, hide or delete them, with a confirmation before anything is posted or removed. Use when the user asks who commented on a post, wants to answer comments, or wants to clear spam from a post. |
| [`inbox-triage`](inbox-triage/SKILL.md) | Read, sort and answer the BulkPublish Inbox (direct messages, reviews and comment threads) with a confirmation before every reply. Use when the user asks about messages, DMs, reviews, what is waiting for a reply, or wants to clear, snooze, archive or assign conversations. |
