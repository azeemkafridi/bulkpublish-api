import type { HttpClient } from './client.js';

export interface Webhook {
  id: number;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface CreateWebhookParams {
  url: string;
  events: ('post.published' | 'post.failed' | 'post.scheduled')[];
  secret?: string;
}

export interface UpdateWebhookParams {
  url?: string;
  events?: string[];
  isActive?: boolean;
  secret?: string;
}

/**
 * Manage webhooks that receive real-time notifications when posts are published, fail, or are scheduled.
 *
 * @example
 * ```ts
 * const webhook = await bp.webhooks.create({
 *   url: 'https://your-app.com/webhooks/bulkpublish',
 *   events: ['post.published', 'post.failed'],
 *   secret: 'whsec_your_signing_secret',
 * });
 * ```
 */
export class WebhooksResource {
  constructor(private readonly http: HttpClient) {}

  /** List all webhooks. */
  async list(): Promise<Webhook[]> {
    return this.http.get('/api/webhooks');
  }

  /** Create a new webhook. */
  async create(params: CreateWebhookParams): Promise<Webhook> {
    return this.http.post('/api/webhooks', params);
  }

  /** Update a webhook by ID. */
  async update(id: number, params: UpdateWebhookParams): Promise<Webhook> {
    return this.http.put(`/api/webhooks/${id}`, params);
  }

  /** Delete a webhook by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/webhooks/${id}`);
  }
}
