import type { HttpClient } from './client.js';

export interface CalendarNote {
  id: number;
  /** Calendar date, YYYY-MM-DD. */
  date: string;
  body: string;
  /** Six-digit hex colour. */
  color: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calendar notes — free text pinned to a day on the calendar (a campaign, a
 * holiday, "no posts this week"). They never publish anywhere.
 *
 * @example
 * ```ts
 * const { notes } = await bp.calendarNotes.list({ from: '2026-09-01', to: '2026-09-30' });
 * await bp.calendarNotes.create({ date: '2026-09-14', body: 'Campaign kickoff', color: '#3B82F6' });
 * ```
 */
export class CalendarNotesResource {
  constructor(private readonly http: HttpClient) {}

  /** Notes in [from, to] (inclusive, at most a year apart), ordered by date. */
  async list(params: { from: string; to: string }): Promise<{ notes: CalendarNote[] }> {
    return this.http.get('/api/calendar-notes', params);
  }

  async create(params: { date: string; body: string; color?: string }): Promise<{ note: CalendarNote }> {
    return this.http.post('/api/calendar-notes', params);
  }

  /** Change the day, text and/or colour (at least one field). */
  async update(id: number, params: { date?: string; body?: string; color?: string }): Promise<{ note: CalendarNote }> {
    return this.http.put(`/api/calendar-notes/${id}`, params);
  }

  async delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete(`/api/calendar-notes/${id}`);
  }
}
