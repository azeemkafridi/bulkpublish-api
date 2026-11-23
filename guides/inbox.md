# Inbox and Comments

Read and answer direct messages, reviews, comments and mentions across your connected channels, from the API, the SDKs or an AI assistant.

There are two parts:

- **The Inbox** — conversations: direct-message threads, reviews (Facebook Page recommendations, Google Business reviews), the comment thread on each of your published posts, and mentions of your accounts. List them, read one, reply, mark read, archive, snooze or assign, leave internal notes for your team, label them, and keep saved replies.
- **Comments on a post** — read the comments on one published post, reply to a comment, or like, hide or delete it.

## Availability

| | Plans | Before it is available to your account |
|---|---|---|
| Inbox (`/api/inbox/...`) | Pro and Business | `403` with `code: "FEATURE_DISABLED"`, `feature: "inbox"` |
| Comment replies and moderation (`/api/posts/{id}/comments/...`) | Every plan except Free | `403` with `code: "FEATURE_DISABLED"`, `feature: "comments_inbox"` |
| Reading a post's comments (`GET /api/posts/{id}/engagement`) | Every plan | Always available |

On a plan without the Inbox or comment replies, the `403` also carries `plan`, `upgrade: true` and a `hint` naming the plan to upgrade to:

```json
{
  "error": {
    "message": "This feature is not available on the Free plan.",
    "hint": "Upgrade to Pro to use it.",
    "code": "FEATURE_DISABLED",
    "feature": "inbox",
    "plan": "free",
    "upgrade": true
  }
}
```

Check `code`, not the sentence.

## Authentication

- **API keys** (`Bearer bp_...`) work as for every other endpoint. The key acts with its owner's role.
- **OAuth apps** (`Bearer bpat_...`) need the new scopes:
  - `inbox:read` — list conversations, read messages and your team's notes, and list saved replies.
  - `inbox:write` — reply, update and label conversations, leave notes, manage saved replies, and reply to or moderate comments.
  - `full` covers both. `posts:write` does **not**: answering people is a separate consent from publishing posts, so an app that could already publish gains nothing until the user grants an inbox scope.

Reading is open to every role. Replying, updating or labelling a conversation, leaving a note, managing saved replies and replying to comments need a role that can edit posts (owner, admin, approver, contributor). A read-only API key can read everything here and change nothing. Deleting a comment needs a role that can publish (owner, admin, approver).

## List conversations

```bash
curl "https://app.bulkpublish.com/api/inbox/conversations?kind=dm&limit=20" \
  -H "Authorization: Bearer bp_your_key_here"
```

Filters: `status` (`open` default, `archived`, `snoozed`), `kind` (`dm`, `review`, `comment`, `mention`), `platforms` (comma-separated), `channelId`, `assigned` (`me`, `unassigned` or a user id), `labelId` and `labelIds` (Inbox labels; `labelIds` matches any of them), `q` (2 to 100 characters, searches the person's name, handle, the message text and your team's notes) and `limit` (1 to 100, default 50).

Each conversation carries its `labels` (`[{id, name, color}]`). A mention (`kind: "mention"`) is a post by someone else that mentions one of your accounts; `url` links to it when the network provides one. Mentions appear only from networks that deliver them, which depends on the network and your plan.

Each conversation carries `canReply`. When it is `false`, `replyNotice` says why in a sentence you can show a person (for example, the platform's reply window has closed).

**Paging.** Pass `nextCursor` back as `cursor` until it is `null`. Treat the cursor as opaque.

```javascript
let cursor;
do {
  const page = await bp.inbox.listConversations({ status: 'open', cursor });
  for (const c of page.conversations) console.log(c.platform, c.participant.name, c.unreadCount);
  cursor = page.nextCursor ?? undefined;
} while (cursor);
```

```python
cursor = None
while True:
    page = bp.inbox.list_conversations(status="open", cursor=cursor)
    for c in page["conversations"]:
        print(c["platform"], c["participant"]["name"], c["unreadCount"])
    cursor = page["nextCursor"]
    if not cursor:
        break
```

Conversations on networks that are not yet generally available are not included for API keys and OAuth apps.

## Read a conversation

```bash
curl "https://app.bulkpublish.com/api/inbox/conversations/123/messages" \
  -H "Authorization: Bearer bp_your_key_here"
```

Returns the newest 500 messages, oldest first. `direction` is `in` (from the other person), `out` (sent by your workspace) or `note` (an internal note for your team, with its `author`; never sent). Reading does **not** mark the conversation read.

## Reply

```bash
curl -X POST "https://app.bulkpublish.com/api/inbox/conversations/123/messages" \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Thanks for getting in touch! We will ship it Monday."}'
```

The reply is sent to the person on the platform immediately and **cannot be unsent**. Send `text` (up to 4,000 characters), `mediaIds` (up to 4 files from your media library), or both. Which attachments a platform takes is in the conversation's `attachments`; reviews, comments and mentions are text only. A reply to a mention answers the post that mentioned you, publicly.

| Status | Meaning |
|---|---|
| `201` | Sent. `messageId` is the platform's id for it. |
| `409` `RECONNECT_REQUIRED` | The channel needs reconnecting from the Channels page. Reconnect, then retry. |
| `422` | The channel cannot reply here, the reply window has closed (Facebook Messenger and Instagram accept replies only within 24 hours of the person's last message), or an attachment is not accepted. |
| `403` `QUOTA_EXCEEDED` | X only: the workspace's monthly X budget cannot cover the send. Replies on X count against the same budget as publishing to X. |
| `429` | More than 30 replies a minute. |
| `502` | The platform refused the send; `error` carries its reason. |

## Mark read, archive, snooze, assign

```bash
curl -X PATCH "https://app.bulkpublish.com/api/inbox/conversations/123" \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"read": true, "status": "archived"}'
```

| Field | Effect |
|---|---|
| `read` | `true` marks it read, `false` unread |
| `status` | `archived` archives it, `open` reopens it; either clears a snooze |
| `snoozedUntil` | An ISO time in the future, at most 90 days out; it reopens on its own then (within a few minutes). `null` unsnoozes |
| `assignedUserId` | A member of the workspace, who is notified; `null` unassigns |

Nothing is sent to the other person and nothing changes on the platform. Limited to 60 changes a minute.

## Internal notes

```bash
curl -X POST "https://app.bulkpublish.com/api/inbox/conversations/123/notes" \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Refund approved. @[Sam](user:USER_ID) can you reply?"}'
```

A note stays inside your workspace; nothing is sent to the other person. Its author is the person the API key or OAuth app acts for. `@[Display Name](user:USER_ID)` mentions a member of the workspace, who is notified (at most 10 per note); the teammate the conversation is assigned to is told about every note. Up to 4,000 characters.

## Labels

Inbox labels are labels with `type: "inbox"`. Create one with `POST /api/labels` (`{"name": "VIP", "type": "inbox"}`) and list them with `GET /api/labels?type=inbox`. Then set a conversation's labels:

```bash
curl -X PUT "https://app.bulkpublish.com/api/inbox/conversations/123/labels" \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"labelIds": [7, 9]}'
```

The ids replace the conversation's labels; `[]` removes them all, and a conversation carries at most 20. An id that is not an Inbox label of your workspace returns `422` and nothing changes.

## Saved replies

Saved replies are reusable answers shared by the whole workspace (at most 200, names unique).

```javascript
const { savedReplies, variables } = await bp.inbox.listSavedReplies();
await bp.inbox.createSavedReply({ name: 'Shipping', body: 'Hi {{first_name}}, it ships Monday.' });
```

```python
data = bp.inbox.list_saved_replies()
bp.inbox.create_saved_reply(name="Shipping", body="Hi {{first_name}}, it ships Monday.")
```

`variables` lists the placeholders a reply may contain (`name`, `first_name`, `handle`, `account`, `platform`, written as `{{first_name}}`). They are returned as written: fill them in yourself, then send the text with the reply endpoint. `PUT /api/inbox/saved-replies/{id}` replaces the name and text (send both); `DELETE` removes it.

## Comments on a published post

Read the comments first. Each channel's entry has a `postPlatformId`, and each comment an `id`:

```javascript
const { platforms } = await bp.posts.engagement(42);
const entry = platforms.find((p) => p.platform === 'instagram');
const comment = entry.engagement.comments[0];

await bp.posts.replyToComment(42, {
  postPlatformId: entry.postPlatformId,
  commentId: comment.id,
  text: 'Thank you!',
});

await bp.posts.moderateComment(42, {
  postPlatformId: entry.postPlatformId,
  commentId: comment.id,
  action: 'hide',
});
```

```python
data = bp.posts.engagement("42")
entry = next(p for p in data["platforms"] if p["platform"] == "instagram")
comment = entry["engagement"]["comments"][0]

bp.posts.reply_to_comment("42", post_platform_id=entry["postPlatformId"], comment_id=comment["id"], text="Thank you!")
bp.posts.moderate_comment("42", post_platform_id=entry["postPlatformId"], comment_id=comment["id"], action="hide")
```

- **Reply** posts publicly, immediately, as the channel the post was published to, and cannot be taken back from here. Up to 2,000 characters. When replying to a reply on Instagram or YouTube, pass the thread's top-level comment as `rootCommentId`. Limited to 10 replies a minute.
- **Moderate** takes `like`, `unlike`, `hide`, `unhide` or `delete`. Likes and hides can be undone; **delete is permanent** on the platform. Which actions a channel supports is in `commentActions` on its engagement entry; anything else returns `422`. Hiding or deleting also removes the comment from your Inbox. Limited to 30 actions a minute.
- Both return `409` when the channel needs reconnecting (`RECONNECT_REQUIRED`) or the post has not been published to that channel.

TikTok, Pinterest, Google Business, Telegram and Snapchat have no comment access for posts; their engagement entries say so in `notice`.

## From an AI assistant

The MCP server has thirteen tools for this: `list_conversations`, `get_conversation`, `reply_to_conversation`, `update_conversation`, `add_conversation_note`, `set_conversation_labels`, `list_saved_replies`, `create_saved_reply`, `update_saved_reply`, `delete_saved_reply`, `list_post_comments`, `reply_to_comment` and `moderate_comment`.

- **Local server** (`npx -y @bulkpublish/mcp-server`): included by default.
- **Hosted server** (`https://mcp.bulkpublish.com/mcp`): served, except `update_saved_reply` and `delete_saved_reply`, which `https://mcp.bulkpublish.com/mcp/full` adds. See [mcp-server/README.md](../mcp-server/README.md#tool-profiles).

The reply and moderate tools are marked as destructive, so assistants that honour tool hints ask before running them. When a call is refused, the assistant sees the same message and hint as the API returns, for example "This feature is not available on the Free plan. Upgrade to Pro to use it."
