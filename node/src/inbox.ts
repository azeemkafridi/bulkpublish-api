import type { HttpClient } from './client.js';

export type ConversationKind = 'dm' | 'review' | 'comment' | 'mention';
export type ConversationStatus = 'open' | 'archived' | 'snoozed';

export interface InboxPerson {
  id: string;
  name: string;
  image: string | null;
}

/** An inbox label on a conversation. */
export interface ConversationLabel {
  id: number;
  name: string;
  color: string | null;
}

export interface Conversation {
  id: number;
  /** The platform the conversation is on. */
  platform: string;
  /**
   * `dm` direct-message thread, `review` a single review, `comment` the comment thread on one of your
   * published posts, `mention` a post by someone else that mentions your account (a reply answers that post).
   * Whether mentions are delivered depends on the network and on your workspace's plan.
   */
  kind: ConversationKind;
  /** Mentions only (absent on other kinds): a link to the post the mention was made in, when the network provides one. */
  url?: string | null;
  /** The inbox labels on this conversation. Set them with `setLabels()`. */
  labels: ConversationLabel[];
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
  /** Only conversations carrying this inbox label. Combined with `labelIds`, both must match. */
  labelId?: number;
  /** Comma-separated inbox label ids; matches conversations carrying ANY of them (at most 50 are used). */
  labelIds?: string;
  /** Search the participant's name and handle, the message text and your team's internal notes (2 to 100 characters). */
  q?: string;
  /** `nextCursor` from the previous page. Opaque. */
  cursor?: string;
  /** Page size, 1 to 100 (default 50). */
  limit?: number;
  /** Skip this many conversations, for numbered pages. Ignored when `cursor` is sent. */
  offset?: number;
}

export interface ListConversationsResponse {
  conversations: Conversation[];
  /** Pass back as `cursor` for the next page; `null` on the last page. */
  nextCursor: string | null;
  /** Where this page started when paging by `offset`; 0 when paging by `cursor`. */
  offset?: number;
  /** How many conversations match the filters, across every page. */
  total?: number;
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
  /** `in` from the other person, `out` sent by your workspace, `note` an internal note for your team (never sent). */
  direction: 'in' | 'out' | 'note';
  text: string | null;
  attachments: Array<{ type: string; url: string; name?: string }> | null;
  rating: number | null;
  sentAt: string;
  readAt: string | null;
  /** Comment threads: who wrote this comment. */
  actor: Record<string, unknown> | null;
  /** The teammate who sent an `out` message from BulkPublish, or wrote a `note`, when known. */
  authorUserId: string | null;
  author: InboxPerson | null;
  /** Comment threads: the platform id of the comment this one replies to. */
  parentId: string | null;
  likeCount: number | null;
}

export interface ConversationMessagesResponse {
  conversationId: number;
  /** The newest 500 messages, oldest first, with your team's internal notes inline (`direction: 'note'`). */
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

export interface AddConversationNoteParams {
  /**
   * 1 to 4,000 characters. Write `@[Display Name](user:USER_ID)` to mention a member of the
   * workspace; they are notified when note mentions are available to your account.
   */
  text: string;
}

export interface AddConversationNoteResponse {
  success: boolean;
  message: {
    id: number;
    direction: 'note';
    text: string;
    sentAt: string;
    authorUserId: string;
    author: InboxPerson;
  };
}

export interface SetConversationLabelsResponse {
  success: boolean;
  /** The ids now on the conversation, duplicates removed. */
  labelIds: number[];
}

/** A reusable answer, shared by the whole workspace. */
export interface SavedReply {
  id: number;
  name: string;
  /** The reply text, with any `{{variable}}` placeholders left as written. */
  body: string;
  /** User id of the teammate who created it. */
  createdBy: string | null;
  updatedAt: string;
}

export type SavedReplyVariableKey = 'name' | 'first_name' | 'handle' | 'account' | 'platform';

export interface ListSavedRepliesResponse {
  /** Sorted by name; a workspace holds at most 200. */
  savedReplies: SavedReply[];
  /** The placeholders a reply may contain, written as `{{key}}`. They are not filled in for you. */
  variables: Array<{ key: SavedReplyVariableKey; description: string }>;
}

export interface SavedReplyParams {
  /** 1 to 100 characters. Unique within the workspace (409 otherwise). */
  name: string;
  /** 1 to 4,000 characters. May contain `{{variable}}` placeholders. */
  body: string;
}

/**
 * Read and answer direct messages, reviews, comment threads and mentions across
 * your connected channels, leave internal notes for your team, label
 * conversations, and keep saved replies.
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
 * await bp.inbox.addNote(conversations[0].id, { text: 'Answered, refund on its way.' });
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

  /**
   * Leave an internal note on a conversation for your team. It is never sent to
   * the other person. The author is the person the API key or OAuth app acts for.
   */
  addNote(id: number, params: AddConversationNoteParams): Promise<AddConversationNoteResponse> {
    return this.http.post(`/api/inbox/conversations/${id}/notes`, params);
  }

  /**
   * Replace a conversation's inbox labels with exactly `labelIds` (`[]` removes
   * them all, at most 20). Every id must be a label of type `inbox`; if any is
   * not, nothing changes and it throws 422.
   */
  setLabels(id: number, labelIds: number[]): Promise<SetConversationLabelsResponse> {
    return this.http.put(`/api/inbox/conversations/${id}/labels`, { labelIds });
  }

  /** The workspace's saved replies, sorted by name, plus the placeholders they may contain. */
  listSavedReplies(): Promise<ListSavedRepliesResponse> {
    return this.http.get('/api/inbox/saved-replies');
  }

  /** Add a saved reply for the whole workspace (at most 200). */
  createSavedReply(params: SavedReplyParams): Promise<SavedReply> {
    return this.http.post('/api/inbox/saved-replies', params);
  }

  /** Replace a saved reply's name and text; send both. */
  updateSavedReply(id: number, params: SavedReplyParams): Promise<SavedReply> {
    return this.http.put(`/api/inbox/saved-replies/${id}`, params);
  }

  /** Delete a saved reply. Replies already sent with its text are not affected. */
  deleteSavedReply(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/inbox/saved-replies/${id}`);
  }
}
