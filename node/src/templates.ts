import type { HttpClient } from './client.js';

export interface PostTemplate {
  id: number;
  name: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Saved post templates — text to start a new post from. Text only: media,
 * channels and per-platform options belong to the post.
 *
 * @example
 * ```ts
 * const { template } = await bp.templates.create({ name: 'Weekly roundup', content: 'This week:\n- ' });
 * await bp.posts.create({ content: template.content, channels: [...] });
 * ```
 */
export class TemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /** List every template in the organization, sorted by name. */
  async list(): Promise<{ templates: PostTemplate[] }> {
    return this.http.get('/api/templates');
  }

  async get(id: number): Promise<{ template: PostTemplate }> {
    return this.http.get(`/api/templates/${id}`);
  }

  /** Create a template. Up to 200 per organization; names are unique. */
  async create(params: { name: string; content: string }): Promise<{ template: PostTemplate }> {
    return this.http.post('/api/templates', params);
  }

  /** Rename and/or replace the text (at least one field). */
  async update(id: number, params: { name?: string; content?: string }): Promise<{ template: PostTemplate }> {
    return this.http.put(`/api/templates/${id}`, params);
  }

  async delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete(`/api/templates/${id}`);
  }
}
