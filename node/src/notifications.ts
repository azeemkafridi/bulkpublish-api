import type { HttpClient } from './client.js';

export interface Notification {
  id: number;
  userId: string;
  organizationId: number | null;
  /** Name of the organization the notification belongs to, when it has one. */
  organizationName: string | null;
  /** e.g. 'post_published', 'post_failed', 'token_expiring'. */
  type: string;
  title: string;
  message: string;
  /** Free-form payload for the notification type. */
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface ListNotificationsParams {
  /** 1-based. Defaults to 1. */
  page?: number;
  /** 1 to 100. Defaults to 20. */
  limit?: number;
  /** Return only unread notifications. `unreadTotal` still counts them all. */
  unreadOnly?: boolean;
}

export interface NotificationList {
  notifications: Notification[];
  /**
   * Unread across the whole account, not just this page and not affected by
   * `unreadOnly`, so the number means the same thing however you filtered.
   */
  unreadTotal: number;
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface NotificationPreferences {
  emailOnFailure: boolean;
  emailOnTokenExpiry: boolean;
  emailOnChannelSlots: boolean;
  inAppPublished: boolean;
  inAppFailed: boolean;
  inAppScheduleReminder: boolean;
  inAppTokenExpiry: boolean;
  inAppInbox: boolean;
  inAppAssignments: boolean;
  inAppApprovals: boolean;
  inAppMentions: boolean;
  /** A teammate left a note on a post you wrote or are assigned to. Default true. */
  inAppNotes: boolean;
  emailOnApprovalRequest: boolean;
}

/**
 * What the app has told you: a post published, a post failed, a connection is
 * about to expire.
 *
 * This is a read-and-acknowledge surface, and it is the closest thing to being
 * notified that the API offers. It is still something you ask for rather than
 * something that arrives.
 *
 * @example
 * ```ts
 * const { notifications, unreadTotal } = await bp.notifications.list({ unreadOnly: true });
 * await bp.notifications.markRead({ ids: notifications.map((n) => n.id) });
 * ```
 */
export class NotificationsResource {
  constructor(private readonly http: HttpClient) {}

  /** List notifications, newest first. */
  async list(params: ListNotificationsParams = {}): Promise<NotificationList> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    if (params.unreadOnly) query.set('unreadOnly', 'true');
    const qs = query.toString();
    return this.http.get(`/api/notifications${qs ? `?${qs}` : ''}`);
  }

  /**
   * Mark notifications read, either a specific set or all of them.
   *
   * Pass exactly one of `ids` or `all`.
   */
  async markRead(params: { ids: number[] } | { all: true }): Promise<{ success: boolean }> {
    return this.http.patch('/api/notifications', params);
  }

  /** Delete notifications, either a specific set or all of them. */
  async delete(params: { ids: number[] } | { all: true }): Promise<{ success: boolean }> {
    return this.http.delete('/api/notifications', params);
  }

  /** The current delivery preferences for this user. */
  async preferences(): Promise<NotificationPreferences> {
    return this.http.get('/api/notifications/preferences');
  }

  /** Update delivery preferences. Omitted fields are left as they are. */
  async updatePreferences(
    params: Partial<NotificationPreferences>,
  ): Promise<NotificationPreferences> {
    return this.http.put('/api/notifications/preferences', params);
  }
}
