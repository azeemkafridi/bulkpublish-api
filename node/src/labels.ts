import type { HttpClient } from './client.js';

export interface Label {
  id: number;
  name: string;
  color: string;
  createdAt: string;
}

export interface CreateLabelParams {
  name: string;
  color?: string;
}

export interface UpdateLabelParams {
  name?: string;
  color?: string;
}

/**
 * Manage labels for organizing posts and media.
 *
 * @example
 * ```ts
 * const labels = await bp.labels.list();
 * const label = await bp.labels.create({ name: 'Campaign Q2', color: '#3b82f6' });
 * ```
 */
export class LabelsResource {
  constructor(private readonly http: HttpClient) {}

  /** List all labels in the current organization. */
  async list(): Promise<Label[]> {
    return this.http.get('/api/labels');
  }

  /** Create a new label. */
  async create(params: CreateLabelParams): Promise<Label> {
    return this.http.post('/api/labels', params);
  }

  /** Update a label by ID. */
  async update(id: number, params: UpdateLabelParams): Promise<Label> {
    return this.http.put(`/api/labels/${id}`, params);
  }

  /** Delete a label by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/labels/${id}`);
  }
}
