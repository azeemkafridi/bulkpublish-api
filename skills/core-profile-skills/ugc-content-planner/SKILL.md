---
name: ugc-content-planner
description: Plan user-generated-content campaigns and convert approved UGC into compliant, platform-ready BulkPublish posts.
---

# UGC Content Planner

Design a UGC pipeline from prompt and collection through permission, review, adaptation, and publication.

## Workflow

- Define the prompt, audience, submission format, collection window, moderation rules, permission record, attribution, and escalation path.
- Separate approved, pending, rejected, and unusable submissions.
- Redact private information and flag copyright, consent, safety, and disclosure issues before use.
- Prepare platform variants and validate media with `media-preflight`.
- Use BulkPublish to upload approved media and create drafts or scheduled posts; preserve a reference to the permission record in the content workflow.

Never infer permission from a public post alone and never publish pending UGC.
