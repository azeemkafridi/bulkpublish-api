/**
 * Base error class for all BulkPublish SDK errors.
 *
 * @example
 * ```typescript
 * try {
 *   await bp.posts.get(999);
 * } catch (err) {
 *   if (err instanceof BulkPublishError) {
 *     console.log(err.status, err.code, err.message);
 *   }
 * }
 * ```
 */
export class BulkPublishError extends Error {
  /** HTTP status code from the API response. */
  public readonly status: number;
  /** Machine-readable error code from the API (e.g. 'NOT_FOUND', 'VALIDATION_ERROR'). */
  public readonly code: string | undefined;
  /** Optional hint for resolving the error. */
  public readonly hint: string | undefined;

  constructor(message: string, status: number, code?: string, hint?: string) {
    super(message);
    this.name = 'BulkPublishError';
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

/**
 * Thrown when the API returns 401 Unauthorized (invalid or missing API key).
 *
 * @example
 * ```typescript
 * try {
 *   await bp.channels.list();
 * } catch (err) {
 *   if (err instanceof AuthenticationError) {
 *     console.log('Bad API key — check your bp_ token');
 *   }
 * }
 * ```
 */
export class AuthenticationError extends BulkPublishError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'AuthenticationError';
  }
}

/**
 * Thrown when the API returns 403 Forbidden (e.g. accessing another user's resource).
 *
 * @example
 * ```typescript
 * try {
 *   await bp.posts.create({ channels: [{ channelId: 999, platform: 'x' }] });
 * } catch (err) {
 *   if (err instanceof ForbiddenError) {
 *     console.log('Resource does not belong to you');
 *   }
 * }
 * ```
 */
export class ForbiddenError extends BulkPublishError {
  constructor(message = 'Forbidden', code?: string) {
    super(message, 403, code || 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

/**
 * Thrown when the API returns 404 Not Found.
 *
 * @example
 * ```typescript
 * try {
 *   await bp.posts.get(999999);
 * } catch (err) {
 *   if (err instanceof NotFoundError) {
 *     console.log('Post does not exist');
 *   }
 * }
 * ```
 */
export class NotFoundError extends BulkPublishError {
  constructor(message = 'Not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when the API returns 429 Too Many Requests (rate limit exceeded).
 *
 * @example
 * ```typescript
 * try {
 *   await bp.posts.list();
 * } catch (err) {
 *   if (err instanceof RateLimitError) {
 *     console.log(`Rate limited. Retry after ${err.retryAfter}s`);
 *   }
 * }
 * ```
 */
export class RateLimitError extends BulkPublishError {
  /** Seconds to wait before retrying, from the `Retry-After` header. */
  public readonly retryAfter: number | undefined;

  constructor(message = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 429, 'RATE_LIMITED');
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Thrown when the API returns 422 Unprocessable Entity (e.g. quota exceeded, queue full).
 *
 * @example
 * ```typescript
 * try {
 *   await bp.posts.create({ ... });
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.log('Validation failed:', err.message);
 *   }
 * }
 * ```
 */
export class ValidationError extends BulkPublishError {
  constructor(message: string, code?: string) {
    super(message, 422, code || 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
