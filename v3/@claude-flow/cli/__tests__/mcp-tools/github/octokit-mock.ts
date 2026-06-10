/**
 * Shared Octokit mock factory for GitHub MCP tool tests.
 *
 * Each test file calls `vi.mock('@octokit/rest', ...)` with a factory that
 * delegates to `createOctokitMock()` so that `new Octokit(...)` returns a
 * fake client object exposing `vi.fn()` stubs for every Octokit method used
 * by the GitHub MCP tools (repo.ts, pull-requests.ts, issues.ts,
 * workflows.ts, metrics.ts).
 *
 * Usage in a test file:
 *
 * ```ts
 * import { vi } from 'vitest';
 * import { createOctokitMock, type OctokitMock } from './octokit-mock.js';
 *
 * let octokitMock: OctokitMock;
 *
 * vi.mock('@octokit/rest', () => ({
 *   Octokit: vi.fn().mockImplementation(() => octokitMock),
 * }));
 *
 * beforeEach(() => {
 *   octokitMock = createOctokitMock();
 * });
 * ```
 */

import { vi } from 'vitest';

export interface OctokitMock {
  repos: {
    get: ReturnType<typeof vi.fn>;
    listLanguages: ReturnType<typeof vi.fn>;
    listBranches: ReturnType<typeof vi.fn>;
    listContributors: ReturnType<typeof vi.fn>;
    getCommitActivityStats: ReturnType<typeof vi.fn>;
    getViews: ReturnType<typeof vi.fn>;
    getClones: ReturnType<typeof vi.fn>;
    listReleases: ReturnType<typeof vi.fn>;
  };
  search: {
    issuesAndPullRequests: ReturnType<typeof vi.fn>;
  };
  pulls: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    createReview: ReturnType<typeof vi.fn>;
    merge: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  issues: {
    listForRepo: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    addAssignees: ReturnType<typeof vi.fn>;
  };
  actions: {
    listRepoWorkflows: ReturnType<typeof vi.fn>;
    createWorkflowDispatch: ReturnType<typeof vi.fn>;
    listWorkflowRuns: ReturnType<typeof vi.fn>;
    getWorkflowRun: ReturnType<typeof vi.fn>;
    cancelWorkflowRun: ReturnType<typeof vi.fn>;
  };
}

/**
 * Creates a fresh fake Octokit client with `vi.fn()` stubs for every method
 * exercised by the GitHub MCP tools. All stubs default to resolving with an
 * empty/benign payload so tests can override only what they need.
 */
export function createOctokitMock(): OctokitMock {
  return {
    repos: {
      get: vi.fn().mockResolvedValue({ data: {} }),
      listLanguages: vi.fn().mockResolvedValue({ data: {} }),
      listBranches: vi.fn().mockResolvedValue({ data: [] }),
      listContributors: vi.fn().mockResolvedValue({ data: [] }),
      getCommitActivityStats: vi.fn().mockResolvedValue({ status: 200, data: [] }),
      getViews: vi.fn().mockResolvedValue({ data: { count: 0, uniques: 0 } }),
      getClones: vi.fn().mockResolvedValue({ data: { count: 0, uniques: 0 } }),
      listReleases: vi.fn().mockResolvedValue({ data: [] }),
    },
    search: {
      issuesAndPullRequests: vi.fn().mockResolvedValue({ data: { total_count: 0, items: [] } }),
    },
    pulls: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ data: {} }),
      createReview: vi.fn().mockResolvedValue({ data: {} }),
      merge: vi.fn().mockResolvedValue({ data: {} }),
      update: vi.fn().mockResolvedValue({ data: {} }),
    },
    issues: {
      listForRepo: vi.fn().mockResolvedValue({ data: [] }),
      create: vi.fn().mockResolvedValue({ data: {} }),
      update: vi.fn().mockResolvedValue({ data: {} }),
      addAssignees: vi.fn().mockResolvedValue({ data: {} }),
    },
    actions: {
      listRepoWorkflows: vi.fn().mockResolvedValue({ data: { workflows: [] } }),
      createWorkflowDispatch: vi.fn().mockResolvedValue({ data: {} }),
      listWorkflowRuns: vi.fn().mockResolvedValue({ data: { workflow_runs: [] } }),
      getWorkflowRun: vi.fn().mockResolvedValue({ data: {} }),
      cancelWorkflowRun: vi.fn().mockResolvedValue({ data: {} }),
    },
  };
}
