---
name: platform-content-adapter
description: Adapt social media content for multiple platforms while preserving the message, voice, and call to action. Use when one source idea needs platform-specific versions.
---

# Platform Content Adapter

Create platform-native variants from a source message, campaign brief, article, transcript, or draft.

## Requirements

- Preserve the factual claims, intended audience, brand voice, and primary CTA.
- Tailor the hook, length, structure, vocabulary, hashtags, and media treatment to each target platform.
- Consult `platform-reference` before recommending a post type or media combination.
- Use `platformContent` when the variants will be published through one BulkPublish post. Keep the shared `content` as a sensible fallback.
- Include required platform fields such as YouTube and Pinterest titles, and exclude platforms whose media requirements are not met.
- Do not invent links, statistics, testimonials, product capabilities, or claims.

Return the adapted copy grouped by platform, with a short note for any omitted platform or required media/metadata.
