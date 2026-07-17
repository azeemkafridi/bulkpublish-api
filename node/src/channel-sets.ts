import type { HttpClient } from './client.js';
import type { ChannelSet, CreateChannelSetParams, UpdateChannelSetParams } from './types.js';

/**
 * Manage channel sets — saved channel groupings for one-click multi-channel targeting.
 *
 * An organization can have up to 50 sets; names are unique per organization
 * (a duplicate name fails with a 409 and error code `DUPLICATE_NAME`).
 *
 * @example
 * ```ts
 * const sets = await bp.channelSets.list();
 * const set = await bp.channelSets.create({ name: 'All socials', channelIds: [1, 2, 3] });
 * ```
 */
export class ChannelSetsResource {
  constructor(private readonly http: HttpClient) {}

  /** List all channel sets in the current organization, ordered by name. */
  async list(): Promise<ChannelSet[]> {
    return this.http.get('/api/channel-sets');
  }

  /**
   * Create a channel set.
   *
   * @throws 400 if the name or channelIds are invalid, or the organization already has 50 sets.
   * @throws 409 with error code `DUPLICATE_NAME` if a set with the same name exists.
   */
  async create(params: CreateChannelSetParams): Promise<ChannelSet> {
    return this.http.post('/api/channel-sets', params);
  }

  /**
   * Update a channel set (partial — pass `name`, `channelIds`, or both; at least one is required).
   *
   * @throws 409 with error code `DUPLICATE_NAME` if the new name collides with another set.
   */
  async update(id: number, params: UpdateChannelSetParams): Promise<ChannelSet> {
    return this.http.put(`/api/channel-sets/${id}`, params);
  }

  /** Delete a channel set by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/channel-sets/${id}`);
  }
}
