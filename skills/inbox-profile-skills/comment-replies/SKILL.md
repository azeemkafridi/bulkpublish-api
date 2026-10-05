---
name: comment-replies
description: Read the comments on a published BulkPublish post and reply to, like, hide or delete them, with a confirmation before anything is posted or removed. Use when the user asks who commented on a post, wants to answer comments, or wants to clear spam from a post.
---

# Comment Replies

Work through the comments under the user's own published posts: read them, group them, draft replies and act on the ones the user approves.

## The rule that matters most

A reply is public and posted immediately, and a deleted comment cannot be restored. Before calling `reply_to_comment`, or `moderate_comment` with `action: "delete"`:

1. Show the exact reply text, or the comment you are about to delete.
2. Name the post, the network and the account it happens on.
3. Wait for an explicit yes for that one item. Approval of one is not approval of the next.

Liking, hiding and unhiding can be undone, but still say what you are about to do before doing it. Never act on a whole list at once.

## Tools

- `list_posts` with `status: "published"`: find the post the user means.
- `list_post_comments`: the comments on that post, per channel, with each comment's id and the `postPlatformId` to answer it on. It also says when a channel cannot be replied to and why.
- `reply_to_comment`: posts a public reply (up to 2,000 characters) under one comment, using the post id, the channel's `postPlatformId` and the comment's id. To answer a reply, pass the thread's top comment as `rootCommentId`.
- `moderate_comment`: `like`, `unlike`, `hide`, `unhide` or `delete`. Only the actions a channel supports are listed for it in `list_post_comments`; do not offer the others.

## Recipe

1. Find the post with `list_posts`, then call `list_post_comments`.
2. Group the comments: questions, praise, complaints, spam.
3. Draft replies for the questions and complaints. Stick to what the post and the user say; do not invent facts.
4. Confirm each reply, then `reply_to_comment`.
5. Propose hiding obvious spam. Delete only when the user explicitly asks for that comment to be deleted.

## When something is refused

Explain it in plain words and say what the user can do.

- **Plan.** Replying to and moderating comments is on every plan except Free. If a call is refused for the plan, say so and suggest upgrading. Reading comments works on every plan.
- **Reconnect needed.** Ask the user to reconnect that channel from the Channels page, then try again.
- **Not available on that network.** Some networks do not allow replies or moderation through BulkPublish. Tell the user to act on the network itself.
- **Role.** Deleting a comment needs an owner, admin or approver on the workspace.
- **Too fast.** Replies are limited to 10 a minute. Wait and continue.
