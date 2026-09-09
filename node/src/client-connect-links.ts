import type { HttpClient } from './client.js';

export type ClientConnectLinkStatus = 'pending' | 'used' | 'revoked' | 'expired';

export interface ClientConnectLink {
  id: number;
  /** Your own label for the client. Never shown to the client themselves. */
  name: string;
  status: ClientConnectLinkStatus;
  expiresAt: string;
  usedAt: string | null;
  connectedChannelId: number | null;
  connectedPlatform: string | null;
  createdAt: string;
}

/** Platforms a client can connect through an anonymous client-connect link. */
export const CLIENT_CONNECT_PLATFORMS = [
  'instagram', 'x', 'tiktok', 'youtube', 'threads', 'pinterest',
  'gmb', 'linkedin', 'reddit', 'discord', 'tumblr', 'snapchat',
] as const;

/**
 * One-time links a client opens, with no BulkPublish account of their own,
 * to connect one of their platform accounts into your organization — the
 * multi-step counterpart of `posts.share()`, for account access instead of
 * content review.
 *
 * The raw connect URL is returned once, on create — it cannot be recovered
 * afterward (the server stores only its hash), so save it when you get it.
 *
 * @example
 * ```ts
 * const { clientConnectLink, url } = await bp.clientConnectLinks.create({ name: 'Acme Corp' });
 * // Send `url` to the client. It expires in 7 days or the moment they connect an account.
 * ```
 */
export class ClientConnectLinksResource {
  constructor(private readonly http: HttpClient) {}

  /** Every client-connect link in the organization, newest first. */
  async list(): Promise<{ clientConnectLinks: ClientConnectLink[] }> {
    return this.http.get('/api/client-connect-links');
  }

  /** Create a link. Expires in 7 days or on first use, whichever comes first. */
  async create(params: { name: string }): Promise<{ clientConnectLink: ClientConnectLink; url: string }> {
    return this.http.post('/api/client-connect-links', params);
  }

  /** Revoke a link. Idempotent; the channel it already connected (if any) is untouched. */
  async delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete(`/api/client-connect-links/${id}`);
  }
}
