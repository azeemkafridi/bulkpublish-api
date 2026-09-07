import type { HttpClient } from './client.js';

export interface Organization {
  id: number;
  name: string;
  slug: string;
  /** Plan tier: 'free', 'pro' or 'business'. */
  plan: string;
  ownerId: string;
  /**
   * The caller's role here: 'owner', 'admin', 'approver', 'contributor' or
   * 'viewer'. ('member' is a legacy value no new code assigns.)
   */
  role: string;
  createdAt: string;
}

export interface CreateOrganizationParams {
  /** Display name. 100 characters or fewer. */
  name: string;
}

/**
 * The organizations you belong to.
 *
 * An API key is bound to one organization, so every other resource in this SDK
 * acts on that one. This is how you find out which organizations exist and
 * what your role is in each.
 *
 * Switching between them and leaving one are session actions rather than API
 * ones, and are deliberately not exposed here: a key does not have a "current"
 * organization to change.
 *
 * @example
 * ```ts
 * const orgs = await bp.organizations.list();
 * const owned = orgs.filter((o) => o.role === 'owner');
 * ```
 */
export class OrganizationsResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List every organization the authenticated user is a member of, with the
   * role they hold in each.
   *
   * Where the user owns several, the `plan` reported is the highest of them:
   * owned organizations share a plan, and this is the figure the app enforces
   * against.
   */
  async list(): Promise<Organization[]> {
    return this.http.get('/api/organizations');
  }

  /** Create a new organization. The caller becomes its owner. */
  async create(params: CreateOrganizationParams): Promise<Organization> {
    return this.http.post('/api/organizations', params);
  }
}
