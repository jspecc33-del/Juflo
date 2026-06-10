/**
 * GitHub Bridge Plugin - Test Helper: Mock GitHub Client
 *
 * Builds an {@link IGitHubClient} backed by a stubbed `Octokit.rest`
 * namespace, so MCP tool handlers can be exercised without live API calls.
 *
 * @module github-bridge/tests/helpers/mock-client
 */

import type { Octokit } from '@octokit/rest';
import type { IGitHubClient } from '../../src/types.js';
import { GitHubBridgeError, GitHubErrorCode, wrapOctokitError } from '../../src/errors.js';

export interface MockClientOptions {
  /** Stubbed `octokit.rest.<namespace>.<method>` tree, e.g. `{ repos: { get: vi.fn() } }`. */
  rest?: Record<string, Record<string, unknown>>;
  /** Whether `isAuthenticated()`/`requireAuth()` should behave as authenticated. Defaults to true. */
  authenticated?: boolean;
  /** Default owner/repo used by `resolveRepo()` when input omits them. */
  defaults?: { owner?: string; repo?: string };
}

export function createMockClient(options: MockClientOptions = {}): IGitHubClient {
  const authenticated = options.authenticated ?? true;
  const defaults = options.defaults ?? {};

  return {
    octokit: { rest: options.rest ?? {} } as unknown as Octokit,
    defaults,
    isAuthenticated: () => authenticated,
    execute: async <T>(action: string, operation: () => Promise<T>): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        throw wrapOctokitError(error, action);
      }
    },
    resolveRepo: (input: { owner?: string; repo?: string }) => {
      const owner = input.owner ?? defaults.owner;
      const repo = input.repo ?? defaults.repo;
      if (!owner || !repo) {
        throw new GitHubBridgeError(
          'owner and repo must be provided (or configured as defaults)',
          GitHubErrorCode.VALIDATION_FAILED,
          { context: { owner, repo } },
        );
      }
      return { owner, repo };
    },
    requireAuth: (action: string) => {
      if (!authenticated) {
        throw new GitHubBridgeError(
          `GitHub authentication is required to ${action}. Set the GITHUB_TOKEN (or GH_TOKEN) environment variable.`,
          GitHubErrorCode.AUTH_REQUIRED,
        );
      }
    },
  };
}

/** Build an Octokit-shaped "request" error as thrown by `@octokit/request-error`. */
export function octokitError(status: number, message: string, headers?: Record<string, string>): Error & { status: number; response: { headers?: Record<string, string>; data: { message: string } } } {
  const error = new Error(message) as Error & { status: number; response: { headers?: Record<string, string>; data: { message: string } } };
  error.status = status;
  error.response = { headers, data: { message } };
  return error;
}
