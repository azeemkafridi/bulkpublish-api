import type { HttpClient } from './client.js';
import type {
  RecurringSchedule,
  CreateScheduleParams,
  UpdateScheduleParams,
} from './types.js';

/**
 * Manage recurring post schedules (frequency-based auto-publishing).
 *
 * @example
 * ```ts
 * const schedules = await bp.schedules.list();
 * const schedule = await bp.schedules.create({
 *   name: 'Daily tip',
 *   frequency: 'daily',
 *   timeOfDay: '09:00',
 *   channelIds: [1, 2],
 *   contentTemplate: 'Tip of the day!',
 *   timezone: 'America/New_York',
 *   requireApproval: true, // hold every occurrence for team approval
 * });
 * ```
 */
export class SchedulesResource {
  constructor(private readonly http: HttpClient) {}

  /** List all recurring schedules. */
  async list(): Promise<RecurringSchedule[]> {
    return this.http.get('/api/schedules');
  }

  /**
   * Create a new recurring schedule.
   *
   * Pass `requireApproval: true` to hold every occurrence the schedule
   * generates for team approval — each generated post lands with
   * `approvalStatus: 'pending'` and the scheduler skips it until an approver
   * releases it via `posts.approve(id)`. Default: false.
   */
  async create(params: CreateScheduleParams): Promise<RecurringSchedule> {
    return this.http.post('/api/schedules', params);
  }

  /**
   * Update a recurring schedule by ID.
   *
   * Toggling `requireApproval` changes the gate for future occurrences only —
   * posts already generated keep the approval status they were created with.
   */
  async update(id: number, params: UpdateScheduleParams): Promise<RecurringSchedule> {
    return this.http.put(`/api/schedules/${id}`, params);
  }

  /** Delete a recurring schedule by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/schedules/${id}`);
  }
}
