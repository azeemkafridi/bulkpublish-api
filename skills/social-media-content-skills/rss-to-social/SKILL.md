---
name: rss-to-social
description: Configure and review RSS-to-social workflows that turn feed items into controlled BulkPublish drafts or posts.
---

# RSS to Social

Build a safe RSS automation plan or configure the BulkPublish RSS feed workflow.

## Workflow

1. Confirm the public RSS/Atom URL, source ownership, target channels, mode (`draft` or `publish`), field mapping, media behavior, and text limits.
2. Prefer `draft` mode for new feeds until output quality and deduplication are proven.
3. Use BulkPublish RSS tools or REST endpoints to create or update the feed, then inspect `enabled`, `lastCheckedAt`, and `lastError`.
4. Use channel overrides only where necessary; keep same-platform copy consistent.
5. Validate media-dependent platforms and review generated posts before enabling automatic publishing.

Changing a feed URL re-baselines it and does not flood the old backlog. Explain that consequence before making that change.
