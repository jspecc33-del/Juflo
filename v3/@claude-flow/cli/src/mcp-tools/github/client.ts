/**
 * GitHub API context resolution for CLI MCP tools.
 *
 * Tools operate in two modes:
 * - Online: a GITHUB_TOKEN/GH_TOKEN env var AND `owner`+`repo` input are
 *   present, so an authenticated Octokit client talks to the real GitHub API.
 * - Offline: either is missing, so handlers fall back to the local JSON
 *   store for workflow coordination without network access.
 */

import { Octokit } from '@octokit/rest';

export interface GitHubContext {
  octokit: Octokit;
  owner: string;
  repo: string;
}

/**
 * Resolves an online GitHub context from input + environment, or returns
 * `null` if a token or owner/repo is not available (caller should fall back
 * to offline/local-store behavior).
 */
export function resolveGitHubContext(input: Record<string, unknown>): GitHubContext | null {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const owner = input.owner as string | undefined;
  const repo = input.repo as string | undefined;

  if (!token || !owner || !repo) {
    return null;
  }

  return { octokit: new Octokit({ auth: token, userAgent: '@claude-flow/cli' }), owner, repo };
}

/**
 * Normalizes Octokit/network errors into a `{success:false, error}` result
 * so handlers never throw for expected API failures (404, 403, etc.).
 */
export function formatGitHubError(error: unknown): { success: false; error: string } {
  if (error && typeof error === 'object') {
    const err = error as { status?: number; message?: string; response?: { data?: { message?: string } } };
    const message = err.response?.data?.message ?? err.message ?? 'Unknown GitHub API error';
    return { success: false, error: err.status ? `${message} (status ${err.status})` : message };
  }
  return { success: false, error: String(error) };
}
