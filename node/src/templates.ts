import type { HttpClient } from './client.js';

export type TemplateKind = 'caption' | 'first_comment';

export interface PostTemplate {
  id: number;
  name: string;
  content: string;
  kind: TemplateKind;
  createdAt: string;
  updatedAt: string;
}

/**
 * Saved post templates — text to start a new post from. Text only: media,
 * channels and per-platform options belong to the post. `kind` picks between
 * a post caption and a saved first-comment reply; names are unique per kind.
 *
 * @example
 * ```ts
 * const { template } = await bp.templates.create({ name: 'Weekly roundup', content: 'This week:\n- ' });
 * await bp.posts.create({ content: template.content, channels: [...] });
 * ```
 */
export class TemplatesResource {
  constructor(private readonly http: HttpClient) {}

  /** List templates in the organization, sorted by name. Defaults to kind: 'caption'. */
  async list(params?: { kind?: TemplateKind }): Promise<{ templates: PostTemplate[] }> {
    const qs = params?.kind ? `?kind=${params.kind}` : '';
    return this.http.get(`/api/templates${qs}`);
  }

  async get(id: number): Promise<{ template: PostTemplate }> {
    return this.http.get(`/api/templates/${id}`);
  }

  /** Create a template. Up to 200 per organization; names are unique per kind (default kind: 'caption'). */
  async create(params: { name: string; content: string; kind?: TemplateKind }): Promise<{ template: PostTemplate }> {
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
