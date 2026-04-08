import type { BulkPublishOptions } from './types.js';
import {
  BulkPublishError,
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors.js';

const DEFAULT_BASE_URL = 'https://app.bulkpublish.com';
const DEFAULT_TIMEOUT = 30_000;
const SDK_VERSION = '1.0.0';

/**
 * Low-level HTTP client used by all resource classes.
 * Wraps native `fetch` with authentication, error handling, and timeout support.
 */
export class HttpClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(options: BulkPublishOptions) {
    if (!options.apiKey) {
      throw new Error('apiKey is required. Get one at https://app.bulkpublish.com/settings/developer');
    }
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT;
  }

  /**
   * Build a full URL from a path and optional query parameters.
   * Filters out undefined/null values from params.
   */
  private buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
    const url = new URL(path, this.baseUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Make an authenticated JSON request to the API.
   *
   * @param method - HTTP method.
   * @param path - API path (e.g. '/api/posts').
   * @param options - Optional body and query params.
   * @returns The parsed JSON response body.
   * @throws {AuthenticationError} on 401
   * @throws {ForbiddenError} on 403
   * @throws {NotFoundError} on 404
   * @throws {RateLimitError} on 429
   * @throws {ValidationError} on 422
   * @throws {BulkPublishError} on other 4xx/5xx
   */
  async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined | null>;
      rawBody?: BodyInit;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const url = this.buildUrl(path, options?.params);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'User-Agent': `bulkpublish-node/${SDK_VERSION}`,
      ...options?.headers,
    };

    let body: BodyInit | undefined;

    if (options?.rawBody) {
      body = options.rawBody;
    } else if (options?.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new BulkPublishError(`Request timed out after ${this.timeout}ms`, 0, 'TIMEOUT');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    // Handle non-JSON responses (e.g. thumbnail redirects)
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (response.ok) {
        return undefined as T;
      }
      const text = await response.text();
      throw new BulkPublishError(text || `HTTP ${response.status}`, response.status);
    }

    const data = await response.json();

    if (response.ok) {
      return data as T;
    }

    // Extract error details from the response body
    const errorObj = data?.error;
    const message = typeof errorObj === 'string'
      ? errorObj
      : errorObj?.message || `HTTP ${response.status}`;
    const code = typeof errorObj === 'object' ? errorObj?.code : undefined;
    const hint = typeof errorObj === 'object' ? errorObj?.hint : undefined;

    switch (response.status) {
      case 401:
        throw new AuthenticationError(message);
      case 403:
        throw new ForbiddenError(message, code);
      case 404:
        throw new NotFoundError(message);
      case 422:
        throw new ValidationError(message, code);
      case 429: {
        const retryAfter = response.headers.get('Retry-After');
        throw new RateLimitError(message, retryAfter ? parseInt(retryAfter, 10) : undefined);
      }
      default:
        throw new BulkPublishError(message, response.status, code, hint);
    }
  }

  /** Shorthand for a GET request. */
  get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    return this.request<T>('GET', path, { params });
  }

  /** Shorthand for a POST request with a JSON body. */
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, { body });
  }

  /** Shorthand for a PUT request with a JSON body. */
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', path, { body });
  }

  /** Shorthand for a PATCH request with a JSON body. */
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('PATCH', path, { body });
  }

  /** Shorthand for a DELETE request. */
  delete<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('DELETE', path, { body });
  }

  /**
   * Upload a file using multipart/form-data.
   * Supports Node.js Buffer, Blob, File, or a file path string.
   *
   * @param path - API path for the upload endpoint.
   * @param file - The file to upload (Buffer, Blob, File, or absolute file path).
   * @param fileName - Optional file name override.
   * @returns Parsed JSON response.
   */
  async upload<T>(path: string, file: Buffer | Blob | string, fileName?: string): Promise<T> {
    const { createReadStream, statSync, readFileSync } = await import('node:fs');
    const { basename } = await import('node:path');

    let blob: Blob;
    let name: string;

    if (typeof file === 'string') {
      // File path — read into a buffer
      const buf = readFileSync(file);
      const ext = file.split('.').pop()?.toLowerCase() || '';
      const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        mp4: 'video/mp4',
        mov: 'video/quicktime',
        webm: 'video/webm',
      };
      const mimeType = mimeMap[ext] || 'application/octet-stream';
      blob = new Blob([buf], { type: mimeType });
      name = fileName || basename(file);
    } else if (Buffer.isBuffer(file)) {
      blob = new Blob([file]);
      name = fileName || 'upload';
    } else {
      blob = file;
      name = fileName || (file instanceof File ? file.name : 'upload');
    }

    const formData = new FormData();
    formData.append('file', blob, name);

    return this.request<T>('POST', path, {
      rawBody: formData,
    });
  }
}
