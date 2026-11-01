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
 * const one = await bp.schedules.get(schedules[0].id);
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

  /**
   * List recurring schedules, newest first. Capped at 500: a workspace with
   * more gets the 500 most recently created. Read any one with {@link get}.
   */
  async list(): Promise<RecurringSchedule[]> {
    return this.http.get('/api/schedules');
  }

  /**
   * Get one recurring schedule by ID, in the same shape as a {@link list} item.
   * A schedule that does not exist or belongs to another workspace is a 404.
   */
  async get(id: number): Promise<RecurringSchedule> {
    return this.http.get(`/api/schedules/${id}`);
  }

  /**
   * Create a new recurring schedule.
   *
   * Pass `requireApproval: true` to hold every occurrence the schedule
   * generates for team approval — each generated post lands with
   * `approvalStatus: 'pending'` and does not publish until an approver
   * releases it via `posts.approve(id)`. Default: false.
   *
   * Forced to true for roles without publish rights (contributors): the flag
   * is set server-side on create and on every update, including an update
   * that does not send it, so a member who cannot publish a single post
   * cannot own an automation that publishes without review.
   */
  async create(params: CreateScheduleParams): Promise<RecurringSchedule> {
    return this.http.post('/api/schedules', params);
  }

  /**
   * Update a recurring schedule by ID.
   *
   * Toggling `requireApproval` changes the gate for future occurrences only —
   * posts already generated keep the approval status they were created with.
   *
   * Forced to true for roles without publish rights (contributors): the flag
   * is set server-side on create and on every update, including an update
   * that does not send it, so a member who cannot publish a single post
   * cannot own an automation that publishes without review.
   */
  async update(id: number, params: UpdateScheduleParams): Promise<RecurringSchedule> {
    return this.http.put(`/api/schedules/${id}`, params);
  }

  /** Delete a recurring schedule by ID. */
  async delete(id: number): Promise<{ success: boolean }> {
    return this.http.delete(`/api/schedules/${id}`);
  }
}
