import type { HttpClient } from './client.js';

export type ConversationKind = 'dm' | 'review' | 'comment';
export type ConversationStatus = 'open' | 'archived' | 'snoozed';

export interface InboxPerson {
  id: string;
  name: string;
  image: string | null;
}

export interface Conversation {
  id: number;
  /** The platform the conversation is on. */
  platform: string;
  /** `dm` direct-message thread, `review` a single review, `comment` the comment thread on one of your published posts. */
  kind: ConversationKind;
  /** Star rating, for reviews. */
  rating: number | null;
  status: ConversationStatus;
  snoozedUntil: string | null;
  assignee: InboxPerson | null;
  channel: { id: number; accountName: string | null; profileImage: string | null };
  participant: { id: string; name: string; handle?: string; avatar?: string; profileUrl?: string };
  unreadCount: number;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastMessagePreview: string | null;
  /** Whether a reply sent now can be delivered. When false, `replyNotice` says why. */
  canReply: boolean;
  /** What a reply may attach on this platform (direct messages only). */
  attachments: { max: number; kinds: Array<'image' | 'video' | 'file'> };
  replyNotice: string | null;
}

export interface ListConversationsParams {
  /** `open` (default), `archived` or `snoozed`. */
  status?: ConversationStatus;
  kind?: ConversationKind;
  /** Comma-separated platforms; matches any of them. */
  platforms?: string;
  /** Single platform (older form of `platforms`). */
  platform?: string;
  channelId?: number;
  /** `me`, `unassigned`, or a teammate's user id. */
  assigned?: string;
  /** Search the participant's name and handle and the message text (2 to 100 characters). */
  q?: string;
  /** `nextCursor` from the previous page. Opaque. */
  cursor?: string;
  /** Page size, 1 to 100 (default 50). */
  limit?: number;
}

export interface ListConversationsResponse {
  conversations: Conversation[];
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
}

export interface UpdateConversationParams {
  /** `true` marks it read, `false` unread. */
  read?: boolean;
  /** `archived` archives it, `open` reopens it. Either clears a snooze. */
  status?: 'open' | 'archived';
  /** ISO timestamp in the future, at most 90 days out; `null` unsnoozes. */
  snoozedUntil?: string | null;
  /** A workspace member's user id (they are notified); `null` unassigns. */
  assignedUserId?: string | null;
}

export interface ConversationMessage {
  id: number;
  platformMessageId: string;
  /** `in` from the other person, `out` sent by your workspace. */
  direction: 'in' | 'out';
  text: string | null;
  attachments: Array<{ type: string; url: string; name?: string }> | null;
  rating: number | null;
  sentAt: string;
  readAt: string | null;
  /** Comment threads: who wrote this comment. */
  actor: Record<string, unknown> | null;
  /** The teammate who sent an `out` message from BulkPublish, when known. */
  authorUserId: string | null;
  author: InboxPerson | null;
  /** Comment threads: the platform id of the comment this one replies to. */
  parentId: string | null;
  likeCount: number | null;
}

export interface ConversationMessagesResponse {
  conversationId: number;
  /** The newest 500 messages, oldest first. */
  messages: ConversationMessage[];
}

export interface SendConversationMessageParams {
  /** Up to 4,000 characters. Send `text`, `mediaIds`, or both. */
  text?: string;
  /** Up to 4 media library file ids. See the conversation's `attachments`. */
  mediaIds?: number[];
  /** Comment threads only: the `id` of the incoming message to answer. */
  replyToMessageId?: number;
}

export interface SendConversationMessageResponse {
  success: boolean;
  /** The platform's id for the sent message. */
  messageId: string;
}

/**
 * Read and answer direct messages, reviews and comment threads across your
 * connected channels.
 *
 * The Inbox is part of the Pro and Business plans. Until it is available to
 * the account every method throws a `ForbiddenError` with
 * `code: 'FEATURE_DISABLED'`; on a plan without it, `hint` names the plan to
 * upgrade to. OAuth tokens need the `inbox:read` / `inbox:write` scopes (or
 * `full`).
 *
 * @example
 * ```ts
 * const { conversations } = await bp.inbox.listConversations({ kind: 'dm' });
 * const { messages } = await bp.inbox.listMessages(conversations[0].id);
 * await bp.inbox.sendMessage(conversations[0].id, { text: 'Thanks for reaching out!' });
 * await bp.inbox.updateConversation(conversations[0].id, { read: true });
 * ```
 */
export class InboxResource {
  constructor(private readonly http: HttpClient) {}

  /** List conversations, newest activity first. Page with `nextCursor`. */
  listConversations(params?: ListConversationsParams): Promise<ListConversationsResponse> {
    return this.http.get(
      '/api/inbox/conversations',
      params as Record<string, string | number | boolean | undefined | null> | undefined,
    );
  }

  /**
   * Mark read/unread, archive or reopen, snooze, or assign one conversation.
   * Nothing is sent to the other person and nothing changes on the platform.
   */
  updateConversation(id: number, params: UpdateConversationParams): Promise<{ success: boolean }> {
    return this.http.patch(`/api/inbox/conversations/${id}`, params);
  }

  /**
   * The newest 500 messages of a conversation, oldest first. Reading does not
   * mark it read; use `updateConversation(id, { read: true })` for that.
   */
  listMessages(id: number): Promise<ConversationMessagesResponse> {
    return this.http.get(`/api/inbox/conversations/${id}/messages`);
  }

  /**
   * Send a reply to the person on the platform, immediately. It cannot be
   * unsent. Throws 409 `RECONNECT_REQUIRED` when the channel must be
   * reconnected, and 422 when the platform's reply window has closed.
   */
  sendMessage(id: number, params: SendConversationMessageParams): Promise<SendConversationMessageResponse> {
    return this.http.post(`/api/inbox/conversations/${id}/messages`, params);
  }
}
