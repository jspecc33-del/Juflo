/**
 * GitHub Bridge Plugin - Octokit Client Wrapper
 *
 * Thin wrapper around `@octokit/rest` that:
 * - Resolves auth tokens from explicit config or GITHUB_TOKEN / GH_TOKEN
 * - Resolves owner/repo defaults for tool calls that omit them
 * - Translates Octokit failures into {@link GitHubBridgeError}
 *
 * @module github-bridge/client
 * @version 0.1.0
 */

import { Octokit } from '@octokit/rest';
import type { GitHubBridgeConfig, IGitHubClient } from './types.js';
import { GitHubBridgeError, GitHubErrorCode, wrapOctokitError } from './errors.js';

const DEFAULT_USER_AGENT = '@claude-flow/plugin-github-bridge';

export class GitHubClient implements IGitHubClient {
  readonly octokit: Octokit;
  readonly defaults: { owner?: string; repo?: string };
  private readonly authenticated: boolean;

  constructor(config: GitHubBridgeConfig = {}) {
    const token = config.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
    this.authenticated = Boolean(token);
    this.defaults = { owner: config.defaultOwner, repo: config.defaultRepo };

    this.octokit =
      config.octokit ??
      new Octokit({
        auth: token,
        baseUrl: config.baseUrl,
        userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
      });
  }

  isAuthenticated(): boolean {
    return this.authenticated;
  }

  async execute<T>(action: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      throw wrapOctokitError(error, action);
    }
  }

  resolveRepo(input: { owner?: string; repo?: string }): { owner: string; repo: string } {
    const owner = input.owner ?? this.defaults.owner;
    const repo = input.repo ?? this.defaults.repo;

    if (!owner || !repo) {
      throw new GitHubBridgeError(
        'owner and repo must be provided (or configured as defaults)',
        GitHubErrorCode.VALIDATION_FAILED,
        { context: { owner, repo } },
      );
    }

    return { owner, repo };
  }

  /**
   * Throws {@link GitHubBridgeError} with code AUTH_REQUIRED if no token is
   * configured. Call this at the top of every mutating tool handler.
   */
  requireAuth(action: string): void {
    if (!this.authenticated) {
      throw new GitHubBridgeError(
        `GitHub authentication is required to ${action}. Set the GITHUB_TOKEN (or GH_TOKEN) environment variable.`,
        GitHubErrorCode.AUTH_REQUIRED,
      );
    }
  }
}

export function createGitHubClient(config?: GitHubBridgeConfig): GitHubClient {
  return new GitHubClient(config);
}
