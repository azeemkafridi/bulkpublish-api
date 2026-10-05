# Inbox and Comments

Read and answer direct messages, reviews and comments across your connected channels, from the API, the SDKs or an AI assistant.

There are two parts:

- **The Inbox** — conversations: direct-message threads, reviews (Facebook Page recommendations, Google Business reviews) and the comment thread on each of your published posts. List them, read one, reply, and mark read, archive, snooze or assign.
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
  - `inbox:read` — list conversations and read messages.
  - `inbox:write` — reply, update conversations, and reply to or moderate comments.
  - `full` covers both. `posts:write` does **not**: answering people is a separate consent from publishing posts, so an app that could already publish gains nothing until the user grants an inbox scope.

Reading is open to every role. Replying, updating a conversation and replying to comments need a role that can edit posts (owner, admin, approver, contributor). Deleting a comment needs a role that can publish (owner, admin, approver).

## List conversations

```bash
curl "https://app.bulkpublish.com/api/inbox/conversations?kind=dm&limit=20" \
  -H "Authorization: Bearer bp_your_key_here"
```

Filters: `status` (`open` default, `archived`, `snoozed`), `kind` (`dm`, `review`, `comment`), `platforms` (comma-separated), `channelId`, `assigned` (`me`, `unassigned` or a user id), `q` (2 to 100 characters, searches the person's name, handle and message text) and `limit` (1 to 100, default 50).

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

Internal notes your team leaves on a conversation are never returned to API keys or OAuth apps, and search does not match on them.

## Read a conversation

```bash
curl "https://app.bulkpublish.com/api/inbox/conversations/123/messages" \
  -H "Authorization: Bearer bp_your_key_here"
```

Returns the newest 500 messages, oldest first. `direction` is `in` (from the other person) or `out` (sent by your workspace). Reading does **not** mark the conversation read.

## Reply

```bash
curl -X POST "https://app.bulkpublish.com/api/inbox/conversations/123/messages" \
  -H "Authorization: Bearer bp_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"text": "Thanks for getting in touch! We will ship it Monday."}'
```

The reply is sent to the person on the platform immediately and **cannot be unsent**. Send `text` (up to 4,000 characters), `mediaIds` (up to 4 files from your media library), or both. Which attachments a platform takes is in the conversation's `attachments`; reviews and comments are text only.

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

The MCP server has seven tools for this: `list_conversations`, `get_conversation`, `reply_to_conversation`, `update_conversation`, `list_post_comments`, `reply_to_comment` and `moderate_comment`.

- **Local server** (`npx -y @bulkpublish/mcp-server`): included by default.
- **Hosted server** (`https://mcp.bulkpublish.com/mcp`): served as the `inbox` tool profile, which is being rolled out. See [mcp-server/README.md](../mcp-server/README.md#tool-profiles).

The reply and moderate tools are marked as destructive, so assistants that honour tool hints ask before running them. When a call is refused, the assistant sees the same message and hint as the API returns, for example "This feature is not available on the Free plan. Upgrade to Pro to use it."
