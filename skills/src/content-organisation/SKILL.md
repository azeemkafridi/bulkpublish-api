---
name: content-organisation
description: Organise a BulkPublish workspace with labels, saved caption and first-comment templates, hashtag groups, calendar notes and saved groups of accounts. Use when the user wants to tag, reuse, group or annotate their content.
profiles: full
---

# BulkPublish — Labels, Templates, Hashtag Groups, Notes and Channel Sets

Show the user each change and wait for a yes before creating, renaming or
deleting anything.

## Labels

`list_labels` (`type`: `post` or `media`; up to 500, alphabetical),
`create_label` (`name`, `color` as hex, `type`), `update_label`,
`delete_label`. Deleting a label removes it from every post or file carrying
it. Posts take labels as `labels` on `create_post` and `labelIds` on
`update_post`; `list_posts` filters with `labelIds` and `labelMode` (`or` for
any, `and` for all).

## Saved templates

`list_templates` (`kind`: `caption` or `first_comment`), `create_template`
(`name`, `content`, `kind`), `update_template`, `delete_template`. Text only:
media and accounts belong to the post. Up to 200 per kind, names unique per
kind. To start a post from a caption template, use its text as the content of
`create_post`. A first-comment snippet is saved here but attached to a post as
`platformSpecific._firstComment`.

## Hashtag groups

`list_hashtag_groups`, `create_hashtag_group` (`name`, `hashtags`),
`update_hashtag_group`, `delete_hashtag_group`. 1 to 30 hashtags each, with or
without `#`, letters, digits and underscores only; names unique; up to 100
groups. To use one, append its hashtags to the post text.

## Calendar notes

`list_calendar_notes` (`from`, `to` as YYYY-MM-DD, at most a year apart),
`create_calendar_note` (`date`, `body`, optional six-digit hex `color`),
`update_calendar_note`, `delete_calendar_note`. Notes mark campaigns, holidays
and quiet days; they never publish. Up to 5000 per workspace.

## Channel sets (saved groups of accounts)

`list_channel_sets`, `create_channel_set` (`name`, `channelIds`),
`update_channel_set`, `delete_channel_set`. Names are unique (a duplicate is
**409** `DUPLICATE_NAME`); up to 50 sets. `create_post` does not take a set:
read its `channelIds` and build `channels` pairs (`{channelId, platform}`) from
`list_channels`.
