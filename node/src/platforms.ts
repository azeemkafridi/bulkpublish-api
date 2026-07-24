import type { HttpClient } from './client.js';
import type { ListPlatformsResponse } from './types.js';

/**
 * Resource for inspecting platform availability.
 *
 * Access via `client.platforms`.
 *
 * Every social platform BulkPublish supports can be switched on or off server-side.
 * Use this resource to render an accurate "temporarily unavailable" or "connections
 * paused" state rather than assuming every platform can be connected or published to.
 *
 * Disabled platforms are always **included** in the response with `enabled: false`
 * and a `reason` — they are never omitted — so you can distinguish "switched off
 * right now" from "not supported".
 *
 * @example
 * ```typescript
 * const bp = new BulkPublish({ apiKey: 'bp_...' });
 *
 * const { platforms } = await bp.platforms.list();
 * for (const p of platforms) {
 *   if (!p.canPublish) console.log(`${p.displayName} is unavailable: ${p.message}`);
 * }
 * ```
 */
export class PlatformsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List every supported platform with its current availability.
   *
   * A platform in state `off` will reject post creation with a 403
   * `PLATFORM_DISABLED` error, and any already-scheduled posts targeting it are
   * **held** — not failed — until it is re-enabled. A platform in state
   * `connect_off` cannot accept new channel connections, but channels already
   * connected keep publishing normally.
   *
   * @returns List of platforms and their availability.
   *
   * @example
   * ```typescript
   * // Check before offering a connect button
   * const { platforms } = await bp.platforms.list();
   * const tumblr = platforms.find((p) => p.platform === 'tumblr');
   * if (tumblr?.canConnect) showConnectButton();
   * ```
   */
  list(): Promise<ListPlatformsResponse> {
    return this.http.get<ListPlatformsResponse>('/api/platforms');
  }
}
