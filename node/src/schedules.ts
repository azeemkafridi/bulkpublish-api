import type { HttpClient } from './client.js';

export interface RecurringSchedule {
  id: number;
  name: string;
  channelIds: number[];
  content: string;
  mediaFiles: number[];
  cronExpression: string;
  timezone: string;
  isActive: boolean;
  nextRunAt: string | null;
  createdAt: string;
}

export interface CreateScheduleParams {
  name: string;
  channelIds: number[];
  content: string;
  mediaFiles?: number[];
  cronExpression: string;
  timezone?: string;
  platformSpecific?: Record<string, unknown>;
}

export interface UpdateScheduleParams {
  name?: string;
  channelIds?: number[];
  content?: string;
  mediaFiles?: number[];
  cronExpression?: string;
  timezone?: string;
  isActive?: boolean;
  platformSpecific?: Record<string, unknown>;
}

/**
 * Manage recurring post schedules (cron-based auto-publishing).
 *
 * @example
 * ```ts
 * const schedules = await bp.schedules.list();
 * const schedule = await bp.schedules.create({
 *   name: 'Daily tip',
 *   channelIds: [1, 2],
 *   content: 'Tip of the day!',
 *   cronExpression: '0 9 * * *',
 *   timezone: 'America/New_York',
 * });
 * ```
 */
export class SchedulesResource {
  constructor(private readonly http: HttpClient) {}

  /** List all recurring schedules. */
  async list(): Promise<RecurringSchedule[]> {
    return this.http.get('/api/schedules');
  }

  /** Create a new recurring schedule. */
  async create(params: CreateScheduleParams): Promise<RecurringSchedule> {
    return this.http.post('/api/schedules', params);
  }

  /** Update a recurring schedule by ID. */
  async update(id: number, params: UpdateScheduleParams): Promise<RecurringSchedule> {
    return this.http.put(`/api/schedules/${id}`, params);
  }

  /** Delete a recurring schedule by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/schedules/${id}`);
  }
}
