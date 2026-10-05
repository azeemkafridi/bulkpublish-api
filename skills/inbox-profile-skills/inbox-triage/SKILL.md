---
name: inbox-triage
description: Read, sort and answer the BulkPublish Inbox (direct messages, reviews and comment threads) with a confirmation before every reply. Use when the user asks about messages, DMs, reviews, what is waiting for a reply, or wants to clear, snooze, archive or assign conversations.
---

# Inbox Triage

The Inbox gathers direct messages, reviews and comment threads from the user's connected accounts, on the networks that allow it. This skill reads it, sorts it and helps the user answer.

## The rule that matters most

Every reply goes to a real person, immediately, and cannot be unsent. Before calling `reply_to_conversation`:

1. Show the user the exact text you will send.
2. Name the recipient: the network, the user's account it goes out from, and the person it is addressed to.
3. Wait for an explicit yes for that message. Approval of one reply is not approval of the next.

Never send in bulk. If the user asks you to answer everything, draft every reply, show them as a numbered list, and send only the ones the user confirms. Drafting is always safe; sending is not.

## Tools

- `list_conversations`: open, archived or snoozed conversations. Filters: `status`, `kind` (`dm`, `review`, `comment`), `platforms`, `channelId`, `assigned` (`me`, `unassigned` or a teammate's id), `q` for text search, `limit`, and `cursor` from the previous page.
- `get_conversation`: the messages in one conversation, oldest first. Reading it does not mark it read.
- `update_conversation`: mark read or unread, archive or reopen, snooze until a time (at most 90 days ahead), assign to a teammate or unassign. Every change can be undone with another call.
- `reply_to_conversation`: sends `text` (up to 4,000 characters). In a direct message it can attach up to 4 `mediaIds` from `upload_media`. In a comment thread it answers the newest comment from the other person, or the one given as `replyToMessageId`.

## Recipes

**What is waiting for me**
1. `list_conversations` with `status: "open"`, adding `assigned: "me"` if the user asks about their own.
2. `get_conversation` on the ones that look urgent: complaints, questions with a deadline, low-star reviews.
3. Summarise each in one line: who wrote, on which account, what they want, how long ago.
4. Offer next steps (reply, assign, snooze, archive) and act only on what the user picks.

**Answer a message or review**
1. `get_conversation` to read the whole thread first.
2. Draft a reply in the user's voice. Keep facts to what the thread and the user tell you; do not invent order numbers, prices or promises.
3. Show the draft with network, account and recipient, and wait for a yes.
4. `reply_to_conversation`, then ask whether to mark it read or archive it.

**Answer a comment thread**
Comment threads on the user's posts appear here with `kind: "comment"`. Read and answer them exactly like a message: the reply is public, so say so when you show the draft.

**Tidy up**
Use `update_conversation` to archive what is done, snooze what has to wait, and assign what belongs to a teammate. Say what you are about to change before you do it.

## When something is refused

Explain it in plain words and say what the user can do. Do not repeat error codes or technical wording.

- **Plan.** The Inbox is part of the Pro and Business plans. If a call is refused for the plan, say so and suggest upgrading.
- **Reconnect needed.** The account was connected before message access was granted. Ask the user to reconnect that channel from the Channels page, then try again.
- **Not available on that network.** Some networks do not allow replies through BulkPublish yet. Tell the user to answer on the network itself.
- **Too fast.** Sending is limited to 30 messages a minute. Wait a minute and continue; never retry in a tight loop.
- **X messages** count against the plan's X allowance. Mention this before a long run of X replies.
