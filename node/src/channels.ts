import type { HttpClient } from './client.js';
import type {
  Channel,
  ListChannelsParams,
  ListChannelsResponse,
  GetChannelResponse,
  ChannelHealthResponse,
  DeleteChannelResponse,
} from './types.js';

/**
 * Resource for managing connected social media channels.
 *
 * Access via `client.channels`.
 *
 * Channels represent connected social media accounts (e.g. your Instagram business page,
 * X account, LinkedIn company page). Channels are created by connecting accounts through
 * the BulkPublish web app — the API provides read and delete access.
 *
 * @example
 * ```typescript
 * const bp = new BulkPublish({ apiKey: 'bp_...' });
 *
 * // List all active channels
 * const { channels } = await bp.channels.list();
 * for (const ch of channels) {
 *   console.log(`${ch.platform}: ${ch.accountName} (${ch.tokenStatus})`);
 * }
 * ```
 */
export class ChannelsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List all connected channels for the authenticated organization.
   * By default, only active channels are returned.
   *
   * @param params - Optional filters.
   * @returns List of channels.
   *
   * @example
   * ```typescript
   * // Get only active channels (default)
   * const { channels } = await bp.channels.list();
   *
   * // Include inactive/disconnected channels
   * const { channels } = await bp.channels.list({ active: false });
   * ```
   */
  list(params?: ListChannelsParams): Promise<ListChannelsResponse> {
    return this.http.get<ListChannelsResponse>('/api/channels', params as Record<string, string>);
  }

  /**
   * Get a single channel by ID.
   *
   * @param id - The channel ID.
   * @returns The channel details.
   *
   * @example
   * ```typescript
   * const { channel } = await bp.channels.get(1);
   * console.log(channel.platform, channel.accountName);
   * ```
   */
  get(id: number): Promise<GetChannelResponse> {
    return this.http.get<GetChannelResponse>(`/api/channels/${id}`);
  }

  /**
   * Delete (disconnect) a channel. This also deactivates any recurring schedules
   * that have no remaining active channels.
   *
   * @param id - The channel ID.
   * @returns Confirmation with the deleted channel ID.
   *
   * @example
   * ```typescript
   * const result = await bp.channels.delete(1);
   * console.log('Deleted channel:', result.deletedId);
   * ```
   */
  delete(id: number): Promise<DeleteChannelResponse> {
    return this.http.delete<DeleteChannelResponse>(`/api/channels/${id}`);
  }

  /**
   * Check the health of a channel's connection by verifying the stored access token
   * against the platform's API.
   *
   * @param id - The channel ID.
   * @returns Health status and token validity.
   *
   * @example
   * ```typescript
   * const health = await bp.channels.health(1);
   * if (!health.healthy) {
   *   console.log('Channel needs reconnection:', health.message);
   * }
   * ```
   */
  health(id: number): Promise<ChannelHealthResponse> {
    return this.http.get<ChannelHealthResponse>(`/api/channels/${id}/health`);
  }
}
