import type { HttpClient } from './client.js';

export type TemplateKind = 'caption' | 'first_comment';

/** The post format a caption template starts in. */
/** A thread is not offered: a template cannot keep thread parts (400). */
export type TemplatePostFormat = 'post' | 'video' | 'reel' | 'story' | 'carousel';

/** A file a template attaches, as returned on every template response. */
export interface TemplateMediaFile {
  id: number;
  originalUrl: string;
  thumbnailUrl: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  altText: string | null;
}

/**
 * The post setup a caption template can keep besides its text. Every field is
 * optional; on update, `null` clears it. Sending any of them on a
 * `first_comment` template is a 400.
 */
export interface TemplateSetup {
  /** Channels a post started from the template is sent to. Channels disconnected since are skipped. Must belong to the workspace (403 otherwise). */
  channelIds?: number[] | null;
  /** The post format the template starts in, as in a post's `postFormat`. */
  postFormat?: TemplatePostFormat | null;
  /** Per-platform post types, as in a post's `postTypeOverrides`. */
  postTypeOverrides?: Record<string, string> | null;
  /** Media file ids a post started from the template attaches. A file a template uses is kept in the media library. Must belong to the workspace (403 otherwise). */
  mediaFileIds?: number[] | null;
  /** Which of `mediaFileIds` each platform gets, as in a post's `platformMediaFileIds`; every id must be in `mediaFileIds`. */
  platformMediaFileIds?: Record<string, number[]> | null;
  /** Per-platform text, as in a post's `platformContent`. */
  platformContent?: Record<string, string> | null;
}

export interface PostTemplate extends TemplateSetup {
  id: number;
  name: string;
  content: string;
  kind: TemplateKind;
  /** The template's files that are still in the media library, in its order, ready to attach. */
  media?: TemplateMediaFile[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Saved post templates — text to start a new post from. A caption template
 * may also keep a post setup (channels, format, per-platform post types,
 * media, and per-platform media and text); `content` may then be empty, as
 * long as the setup sent holds something.
 * Per-platform publish options (`platformSpecific`) belong to the post.
 * `kind` picks between a post caption and a saved first-comment reply; names
 * are unique per kind.
 *
 * @example
 * ```ts
 * const { template } = await bp.templates.create({ name: 'Weekly roundup', content: 'This week:\n- ' });
 * await bp.posts.create({ content: template.content, channels: [...] });
 *
 * // A caption template that also keeps channels and media:
 * await bp.templates.create({
 *   name: 'Product drop',
 *   content: 'New in store:',
 *   channelIds: [3, 7],
 *   mediaFileIds: [12, 14],
 *   platformMediaFileIds: { instagram: [12, 14], x: [12] },
 * });
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

  /**
   * Create a template. Up to 200 per organization per kind; names are unique per kind (default kind: 'caption').
   * `content` is required unless a caption template sets one of the setup fields to something
   * (an empty text with only `channelIds: []`, say, is refused with 400 "content is required").
   */
  async create(params: { name: string; content?: string; kind?: TemplateKind } & TemplateSetup): Promise<{ template: PostTemplate }> {
    return this.http.post('/api/templates', params);
  }

  /** Rename, replace the text and/or change the setup (at least one field). `null` clears a setup field. */
  async update(id: number, params: { name?: string; content?: string } & TemplateSetup): Promise<{ template: PostTemplate }> {
    return this.http.put(`/api/templates/${id}`, params);
  }

  async delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete(`/api/templates/${id}`);
  }
}
