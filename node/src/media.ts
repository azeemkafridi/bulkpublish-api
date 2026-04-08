import type { HttpClient } from './client.js';
import type {
  MediaFile,
  MediaLabel,
  ListMediaParams,
  ListMediaResponse,
  UploadMediaResponse,
  GetMediaResponse,
} from './types.js';

/**
 * Resource for managing media files (images and videos).
 *
 * Access via `client.media`.
 *
 * Supports uploading images (JPEG, PNG, WebP, GIF) and videos (MP4, QuickTime, WebM)
 * up to 100 MB. Uploaded files are stored on Cloudflare R2 and automatically
 * generate thumbnails and preview variants.
 *
 * @example
 * ```typescript
 * const bp = new BulkPublish({ apiKey: 'bp_...' });
 *
 * // Upload from a file path
 * const { file } = await bp.media.upload('./photo.jpg');
 * console.log(file.id, file.originalUrl);
 *
 * // Use the uploaded file in a post
 * await bp.posts.create({
 *   content: 'Check this out!',
 *   mediaFiles: [file.id],
 *   channels: [{ channelId: 1, platform: 'instagram' }],
 *   status: 'draft',
 * });
 * ```
 */
export class MediaResource {
  constructor(private readonly http: HttpClient) {}

  /**
   * List media files with pagination, search, and label filtering.
   *
   * @param params - Pagination, search, and filter options.
   * @returns Paginated list of media files.
   *
   * @example
   * ```typescript
   * // List recent uploads
   * const { files } = await bp.media.list();
   *
   * // Search by file name
   * const { files } = await bp.media.list({ search: 'banner' });
   *
   * // Filter by labels
   * const { files } = await bp.media.list({ labelIds: '1,2' });
   * ```
   */
  list(params?: ListMediaParams): Promise<ListMediaResponse> {
    return this.http.get<ListMediaResponse>('/api/media', params as Record<string, string>);
  }

  /**
   * Get a single media file by ID.
   *
   * @param id - The media file ID.
   * @returns The media file details.
   *
   * @example
   * ```typescript
   * const { file } = await bp.media.get(1);
   * console.log(file.fileName, file.mimeType, file.originalUrl);
   * ```
   */
  get(id: number): Promise<GetMediaResponse> {
    return this.http.get<GetMediaResponse>(`/api/media/${id}`);
  }

  /**
   * Upload a media file.
   *
   * Accepts a file path (string), a Node.js Buffer, or a Blob/File object.
   * Maximum file size is 100 MB. Supported types: JPEG, PNG, WebP, GIF, MP4,
   * QuickTime (.mov), WebM.
   *
   * @param file - File path, Buffer, Blob, or File to upload.
   * @param fileName - Optional file name override (used when passing a Buffer).
   * @returns The uploaded file metadata.
   *
   * @example
   * ```typescript
   * // Upload from a file path
   * const { file } = await bp.media.upload('./banner.png');
   *
   * // Upload from a Buffer
   * const buffer = fs.readFileSync('./video.mp4');
   * const { file } = await bp.media.upload(buffer, 'promo.mp4');
   *
   * // Upload from a Blob
   * const blob = new Blob([data], { type: 'image/jpeg' });
   * const { file } = await bp.media.upload(blob, 'photo.jpg');
   * ```
   */
  upload(file: string | Buffer | Blob, fileName?: string): Promise<UploadMediaResponse> {
    return this.http.upload<UploadMediaResponse>('/api/media', file, fileName);
  }

  /**
   * Delete a media file. The database record is removed immediately and the
   * underlying R2 storage objects are cleaned up in the background.
   *
   * @param id - The media file ID.
   * @returns Confirmation with the deleted file ID.
   *
   * @example
   * ```typescript
   * const result = await bp.media.delete(1);
   * console.log('Deleted:', result.deletedId);
   * ```
   */
  delete(id: number): Promise<{ success: boolean; deletedId: number }> {
    return this.http.delete<{ success: boolean; deletedId: number }>(`/api/media/${id}`);
  }

  /**
   * Get the labels attached to a media file.
   *
   * @param id - The media file ID.
   * @returns Array of labels.
   *
   * @example
   * ```typescript
   * const labels = await bp.media.getLabels(1);
   * for (const label of labels) {
   *   console.log(label.name, label.color);
   * }
   * ```
   */
  getLabels(id: number): Promise<MediaLabel[]> {
    return this.http.get<MediaLabel[]>(`/api/media/${id}/labels`);
  }

  /**
   * Set (replace) the labels on a media file. Pass an empty array to remove all labels.
   *
   * @param id - The media file ID.
   * @param labelIds - Array of label IDs to set.
   * @returns `{ ok: true }` on success.
   *
   * @example
   * ```typescript
   * // Set labels on a media file
   * await bp.media.setLabels(1, [5, 8]);
   *
   * // Remove all labels
   * await bp.media.setLabels(1, []);
   * ```
   */
  setLabels(id: number, labelIds: number[]): Promise<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`/api/media/${id}/labels`, { labelIds });
  }
}
