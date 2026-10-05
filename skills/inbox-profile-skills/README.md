# Inbox-profile skills

Skills that need the Inbox and comment tools, which the hosted connector serves
only under the 27-tool `inbox` profile (`BULKPUBLISH_TOOL_PROFILE=inbox`). Ship
them alongside `../core-profile-skills` to a connector running that profile,
never to one running `core`.

- `inbox-triage`: list_conversations, get_conversation, update_conversation,
  reply_to_conversation (plus `upload_media` from core).
- `comment-replies`: list_post_comments, reply_to_comment, moderate_comment
  (plus `list_posts` from core). Hold it out of a directory package until those
  tools are live there: on 2026-10-05 OpenAI held list_post_comments and
  moderate_comment for manual review.

Verify with `cd mcp-server && npm run check:skills`.
