---
name: mention-monitoring
description: Keep track of posts by other people that mention the user's connected accounts in the BulkPublish Inbox, sort them, flag them for the team, and answer the ones worth answering after the user confirms. Use when the user asks who mentioned them, what people are saying about the account, or wants to respond to mentions.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# Mention Monitoring

Mentions are posts by other people that tag one of the user's connected
accounts. BulkPublish collects them into the Inbox as conversations with
`kind: "mention"`, one per mentioning post.

## What this covers, and what it does not

- **Covered:** posts that @-mention a connected account on X, TikTok, Threads,
  Bluesky, Mastodon and Tumblr, where the workspace's plan includes mentions.
- **Not covered:** keyword or hashtag searches, posts that name the brand
  without tagging the account, competitors, or any network not listed. Say so
  if the user asks for broader listening; do not imply it from these results.
- **X:** mentions are read only for an X account whose "Sync mentions" switch
  is on in the Inbox, because X charges for every read. If X mentions are
  missing, tell the user where to turn it on.

## Tools

- `list_conversations` with `kind: "mention"`: newest first. Add
  `status: "open"`, `platforms`, `channelId`, `assigned`, `labelId`, or `q`
  (searches the text, the person's name and handle, and team notes). Page with
  `cursor`.
- `get_conversation`: the mention itself and anything the team wrote or sent
  in it. Each mention conversation has a `url` to the original post when the
  network provides one.
- `update_conversation`: mark read, archive, snooze, or assign to a teammate.
- `add_conversation_note`: a note for the team; never sent to the person.
- `set_conversation_labels` with labels of `type: "inbox"` (`list_labels` or
  `create_label`): sort mentions into praise, complaint, question, press.
- `reply_to_conversation`: a public reply to the mentioning post, text only.

## Replying

A reply to a mention is a public post under someone else's post, sent at once
from the mentioned account. It cannot be unsent. Before every reply:

1. Show the exact text, the network, the account it goes out from, and the
   person it answers.
2. Wait for an explicit yes for that reply.

Replies work on X, TikTok, Threads, Bluesky and Mastodon. Tumblr mentions can
be read and sorted but must be answered on Tumblr itself; the call is refused
and says so. Never send replies in bulk.

## Recipe: weekly mention round-up

1. `list_conversations` with `kind: "mention"` and `status: "open"`.
2. `get_conversation` on each one you need the full text of.
3. Group them: questions needing an answer, complaints, praise worth sharing,
   and noise. Give the count of each and the 3 to 5 that matter most, with
   their links.
4. Offer next steps per group: draft replies for the questions, assign
   complaints to the right teammate with a note, label praise for later use,
   archive the noise. Act only on what the user picks.

## Recipe: hand a mention to a teammate

There is no tool that lists the team. A teammate's user id appears as
`assignee.id` on conversations they hold and as `author.id` on notes and
replies they wrote (`get_conversation`). If you have not seen the person's id,
ask the user to assign the conversation in the app; never guess an id.

1. `update_conversation` with that `assignedUserId`.
2. `add_conversation_note` with the context they need. Writing
   `@[Name](user:USER_ID)` notifies that teammate; confirm who it is first.
3. Tell the user who now has it.
