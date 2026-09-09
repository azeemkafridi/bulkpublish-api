# Core-profile skills

The skill set for the **hosted** connector at `mcp.bulkpublish.com`, which serves
the 20-tool `core` profile. Every skill here is limited to those 20 tools.

`../social-media-content-skills` is the other set: it targets the npm/stdio
server, which serves the full profile, and is free to use tools like
`get_quota_usage`, `bulk_posts` and the RSS feed tools. Do not ship that set to a
core-profile connector — a skill that reaches for an absent tool leaves the model
guessing.

What differs from the full set:

- **Not carried over:** `check-quota`, `bulk-publish`, `rss-to-social` — each one
  exists to drive a tool the core profile does not have.
- **Replaced:** `manage-channels` (channel health, options and mention lookup are
  not in core) and `media-library` (replaces the batch half of `bulk-publish`).
- **Corrected:** `schedule-post`, `get-analytics`, `platform-reference` — the
  substance is intact; references to absent tools were removed. Note that
  `requestApproval`, `labels`, `linkTrackingOverride` and story creation via
  `postTypeOverrides` ARE core `create_post` parameters, so that guidance stays.

Verify with `cd mcp-server && npm run check:skills`. The check asserts two things,
because tool names alone are not enough: `rss-to-social` named no tool at all
("use BulkPublish RSS tools") and still promised something core cannot do.
