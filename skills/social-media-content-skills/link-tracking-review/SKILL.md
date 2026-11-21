---
name: link-tracking-review
description: Review social links, BulkPublish link-tracking settings, and tracked-click results without confusing them with platform click metrics.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# Link Tracking Review

Help users decide whether links should be shortened and how to interpret BulkPublish tracking results.

## Workflow

- Check destination URLs, redirects, UTM consistency, CTA alignment, and platform character limits.
- Explain the tri-state `linkTrackingOverride`: omit it to inherit organization settings, use `true` to shorten and track, or `false` to post links as written.
- Remember that shortening may be skipped when it would exceed a platform's limit.
- Use `get-analytics` to report `linkClicks` separately from platform `clicks`; describe zero tracked clicks carefully because it may mean no link, tracking off, or no measured visit.`get_link_analytics` lists every tracked link in a date range with its clicks, most clicked first.
- Prepare the chosen setting for a BulkPublish draft or post without changing organization defaults unless explicitly requested.
