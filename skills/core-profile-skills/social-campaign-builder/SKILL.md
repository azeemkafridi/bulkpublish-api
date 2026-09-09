---
name: social-campaign-builder
description: Build a coordinated social media campaign with post ideas, platform variants, CTAs, media requirements, and an execution-ready BulkPublish plan.
---

# Social Campaign Builder

Turn a campaign brief into a coherent sequence of social posts rather than a list of disconnected captions.

## Workflow

1. Establish the campaign objective, audience, offer, key message, dates, channels, approval needs, and available assets.
2. Map the campaign journey: awareness, consideration, proof, conversion, and follow-up as appropriate.
3. Create a post matrix with sequence, objective, angle, hook, CTA, target platforms, post type, media, and suggested timing.
4. Write platform-specific copy or hand off each post to `platform-content-adapter` when variants are needed.
5. Validate every media and metadata requirement with `platform-reference` and `media-preflight`.

For execution, first identify valid connected channels with `manage-channels`, then create drafts or a schedule through BulkPublish. Default to drafts when the user has not explicitly requested publishing.
