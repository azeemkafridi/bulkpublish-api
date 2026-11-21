---
name: saved-replies-library
description: Build and keep up the team's BulkPublish saved replies from the questions that keep coming up in the Inbox, with placeholders for names and accounts, and use them to answer faster without sending anything unchecked. Use when the user wants canned or template replies, a reply library, or keeps answering the same questions.
---
<!-- Generated from skills/src in the bulkpublish-api repository. Edit the source there, not this copy. -->

# Saved Replies Library

Saved replies are reusable answers the whole team picks from in the Inbox.
Creating or changing one sends nothing to anyone.

## Tools

- `list_saved_replies`: every saved reply, sorted by name, and the
  placeholders a reply may contain.
- `create_saved_reply`: `name` (1 to 100 characters, unique in the
  workspace) and `body` (up to 4,000). A workspace holds at most 200.
- Renaming, rewording or deleting a saved reply is done in the app, not
  through this connection. Point the user to the Inbox's saved replies.
- `list_conversations` and `get_conversation`: to find the questions people
  actually ask.
- `reply_to_conversation`: to send a finished reply, after the user confirms.

## Placeholders

A body may contain placeholders written in double curly braces, for example
`first_name`. `list_saved_replies` returns the current list in `variables`
(today: `name`, `first_name`, `handle`, `account`, `platform`). Use only those.
They are NOT filled in when you send: replace each one from the conversation
yourself, and if you cannot (no handle on that network, for example), rewrite
the sentence rather than send a raw placeholder.

## Recipe: build a library from the Inbox

1. `list_saved_replies` first, so you do not duplicate what exists.
2. `list_conversations` for the last few weeks (open and archived), then
   `get_conversation` on enough of them to see the incoming questions. Use
   `q` to check how often a topic comes up ("price", "refund", "shipping").
3. Group the questions that recur at least 3 times. For each group, draft a
   short answer in the team's voice using only facts the user gives you or
   that the team has already sent in those threads. Never invent prices,
   policies or dates.
4. Show the proposed replies as a list: name, body, and how many
   conversations asked it. Adjust until the user approves each one.
5. `create_saved_reply` for each approved reply. If a name is refused as taken,
   pick another or ask whether to change the existing reply instead.

## Recipe: answer with a saved reply

1. `get_conversation` to read the thread.
2. `list_saved_replies` and pick the one that fits; say which.
3. Fill in the placeholders, adapt the wording to the person's message, and
   show the exact text with the network, account and recipient.
4. Send with `reply_to_conversation` only after a yes for that message. One
   approval covers one message; never send a saved reply to many people in a
   loop.

