import type { HttpClient } from './client.js';

export interface HashtagGroup {
  id: number;
  name: string;
  /** Normalised: leading '#', no spaces, deduplicated. */
  hashtags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateHashtagGroupParams {
  /** 1-100 characters, unique per organization (case-insensitive). */
  name: string;
  /** 1-30 hashtags, with or without the leading '#'. Letters, digits and underscores only. */
  hashtags: string[];
}

export interface UpdateHashtagGroupParams {
  name?: string;
  /** Replaces the whole list. */
  hashtags?: string[];
}

/**
 * Saved hashtag groups — named sets of hashtags to drop into a post.
 *
 * @example
 * ```ts
 * const { groups } = await bp.hashtagGroups.list();
 * const { group } = await bp.hashtagGroups.create({ name: 'Launch', hashtags: ['launch', '#newproduct'] });
 * ```
 */
export class HashtagGroupsResource {
  constructor(private readonly http: HttpClient) {}

  /** List every group in the organization, sorted by name. */
  async list(): Promise<{ groups: HashtagGroup[] }> {
    return this.http.get('/api/hashtag-groups');
  }

  /** Get one group. */
  async get(id: number): Promise<{ group: HashtagGroup }> {
    return this.http.get(`/api/hashtag-groups/${id}`);
  }

  /** Create a group. An organization may keep up to 100. */
  async create(params: CreateHashtagGroupParams): Promise<{ group: HashtagGroup }> {
    return this.http.post('/api/hashtag-groups', params);
  }

  /** Rename a group and/or replace its hashtags (at least one field). */
  async update(id: number, params: UpdateHashtagGroupParams): Promise<{ group: HashtagGroup }> {
    return this.http.put(`/api/hashtag-groups/${id}`, params);
  }

  /** Delete a group. Posts that already contain its hashtags are untouched. */
  async delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete(`/api/hashtag-groups/${id}`);
  }
}
