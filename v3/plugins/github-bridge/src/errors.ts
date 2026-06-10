/**
 * GitHub Bridge Plugin - Typed Error Classes
 *
 * Maps Octokit/GitHub REST API failures (and local validation failures)
 * onto a small set of typed error codes that MCP tool handlers can branch
 * on without inspecting HTTP status codes directly.
 *
 * @module github-bridge/errors
 * @version 0.1.0
 */

export const GitHubErrorCode = {
  VALIDATION_FAILED: 'GH_VALIDATION_FAILED',
  AUTH_REQUIRED: 'GH_AUTH_REQUIRED',
  UNAUTHORIZED: 'GH_UNAUTHORIZED',
  FORBIDDEN: 'GH_FORBIDDEN',
  RATE_LIMITED: 'GH_RATE_LIMITED',
  NOT_FOUND: 'GH_NOT_FOUND',
  CONFLICT: 'GH_CONFLICT',
  UNPROCESSABLE: 'GH_UNPROCESSABLE',
  API_ERROR: 'GH_API_ERROR',
  UNKNOWN: 'GH_UNKNOWN',
} as const;

export type GitHubErrorCodeType = (typeof GitHubErrorCode)[keyof typeof GitHubErrorCode];

/**
 * Base error class for all GitHub Bridge errors.
 */
export class GitHubBridgeError extends Error {
  readonly code: GitHubErrorCodeType;
  readonly status?: number;
  readonly context?: Record<string, unknown>;

  constructor(message: string, code: GitHubErrorCodeType, options?: { status?: number; context?: Record<string, unknown>; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'GitHubBridgeError';
    this.code = code;
    this.status = options?.status;
    this.context = options?.context;
    Object.setPrototypeOf(this, GitHubBridgeError.prototype);
  }
}

/** Raised when zod input validation fails before a tool handler executes. */
export class ValidationError extends GitHubBridgeError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, GitHubErrorCode.VALIDATION_FAILED, { context });
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/** Shape of the subset of `@octokit/request-error`'s RequestError we rely on. */
interface OctokitLikeError {
  status?: number;
  message?: string;
  response?: {
    headers?: Record<string, string | undefined>;
    data?: { message?: string };
  };
}

function isOctokitLikeError(error: unknown): error is OctokitLikeError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

/**
 * Translate an Octokit `RequestError` (or any thrown value) into a
 * {@link GitHubBridgeError} with a stable error code.
 */
export function wrapOctokitError(error: unknown, action: string): GitHubBridgeError {
  if (error instanceof GitHubBridgeError) {
    return error;
  }

  if (isOctokitLikeError(error)) {
    const status = error.status;
    const apiMessage = error.response?.data?.message ?? error.message ?? 'GitHub API request failed';
    const context = { action, status };

    switch (status) {
      case 401:
        return new GitHubBridgeError(`Authentication failed while ${action}: ${apiMessage}`, GitHubErrorCode.UNAUTHORIZED, { status, context, cause: error });
      case 403: {
        const remaining = error.response?.headers?.['x-ratelimit-remaining'];
        if (remaining === '0') {
          return new GitHubBridgeError(`Rate limit exceeded while ${action}: ${apiMessage}`, GitHubErrorCode.RATE_LIMITED, { status, context, cause: error });
        }
        return new GitHubBridgeError(`Forbidden while ${action}: ${apiMessage}`, GitHubErrorCode.FORBIDDEN, { status, context, cause: error });
      }
      case 404:
        return new GitHubBridgeError(`Not found while ${action}: ${apiMessage}`, GitHubErrorCode.NOT_FOUND, { status, context, cause: error });
      case 409:
        return new GitHubBridgeError(`Conflict while ${action}: ${apiMessage}`, GitHubErrorCode.CONFLICT, { status, context, cause: error });
      case 422:
        return new GitHubBridgeError(`Unprocessable request while ${action}: ${apiMessage}`, GitHubErrorCode.UNPROCESSABLE, { status, context, cause: error });
      default:
        return new GitHubBridgeError(`GitHub API error while ${action}: ${apiMessage}`, GitHubErrorCode.API_ERROR, { status, context, cause: error });
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  return new GitHubBridgeError(`Unexpected error while ${action}: ${message}`, GitHubErrorCode.UNKNOWN, { context: { action }, cause: error });
}

/** Convert any error into the `MCPToolResult` failure shape. */
export function toToolError(error: unknown): { success: false; error: string; errorCode: GitHubErrorCodeType } {
  const wrapped = error instanceof GitHubBridgeError ? error : wrapOctokitError(error, 'processing request');
  return { success: false, error: wrapped.message, errorCode: wrapped.code };
}
