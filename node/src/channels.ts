import type { HttpClient } from './client.js';
import type {
  Channel,
  ListChannelsParams,
  ListChannelsResponse,
  GetChannelResponse,
  ChannelHealthResponse,
  ChannelOptionsParams,
  ChannelOptionsResponse,
  DeleteChannelResponse,
  UpdateChannelParams,
  UpdateChannelResponse,
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
   * // Include inactive/disconnected channels (up to 100 of them, newest first)
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
   * Update a channel's per-channel opt-ins. Both switches apply to X channels
   * only, where each read is billed, and each kind is off by default and only
   * unlocked by its own switch: `metricsSyncEnabled` for analytics and likers,
   * `inboxSyncEnabled` for DMs and replies. Fields not sent are left as they are. Requires a role that can
   * manage channels; viewers get 403.
   *
   * @example
   * ```typescript
   * await bp.channels.update(1, { metricsSyncEnabled: true });
   * ```
   */
  update(id: number, params: UpdateChannelParams): Promise<UpdateChannelResponse> {
    return this.http.patch<UpdateChannelResponse>(`/api/channels/${id}`, params);
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

  /**
   * Get a channel's platform options, keyed by `type`: Pinterest boards (or a
   * board's sections with `boardId`), YouTube playlists, Tumblr blogs, Discord
   * text channels, Threads places (`q`), TikTok `creator_info`, and Instagram
   * music (`audio`). A platform without options answers `{ type: null, items: [] }`.
   *
   * Instagram: with no `q` it lists trending tracks; `q` searches, and
   * `audioType: 'original_sound'` searches original sounds instead of music.
   * Pass an item's `id` as `platformSpecific.instagram.audio.audioId`. `probe`
   * only reports whether the account can add music. Music needs an account
   * connected through Facebook: any other Instagram channel answers
   * `{ type: 'audio', unavailable: 'facebook_required', items: [] }`, and
   * `unavailable: 'disabled'` means music is not available for this workspace
   * right now.
   *
   * @param id - The channel ID.
   * @param params - Optional per-platform query (`q`, `boardId`, `audioType`, `probe`).
   *
   * @example
   * ```typescript
   * const { type, items, unavailable } = await bp.channels.options(7, { q: 'summer' });
   * if (type === 'audio' && !unavailable && items?.length) {
   *   await bp.posts.create({
   *     channels: [{ channelId: 7, platform: 'instagram' }],
   *     content: 'New Reel',
   *     mediaFiles: [videoId],
   *     postTypeOverrides: { instagram: 'reel' },
   *     platformSpecific: { instagram: { audio: { audioId: items[0].id, audioVolume: 60 } } },
   *   });
   * }
   * ```
   */
  options(id: number, params?: ChannelOptionsParams): Promise<ChannelOptionsResponse> {
    const query: Record<string, string | undefined> = {
      q: params?.q,
      boardId: params?.boardId,
      audioType: params?.audioType,
      probe: params?.probe ? '1' : undefined,
    };
    return this.http.get<ChannelOptionsResponse>(`/api/channels/${id}/options`, query);
  }
}
