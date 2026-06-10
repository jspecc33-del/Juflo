import { describe, it, expect, vi } from 'vitest';
import { repoAnalyzeTool } from '../../src/tools/repo.js';
import { GitHubErrorCode } from '../../src/errors.js';
import { createMockClient, octokitError } from '../helpers/mock-client.js';

const baseRepoData = {
  default_branch: 'main',
  language: 'TypeScript',
  visibility: 'public',
  private: false,
  stargazers_count: 42,
  forks_count: 7,
  license: { spdx_id: 'MIT' },
  description: 'A test repository',
};

function buildRest(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    repos: {
      get: vi.fn().mockResolvedValue({ data: baseRepoData }),
      listBranches: vi.fn().mockResolvedValue({ data: [{ name: 'main' }, { name: 'dev' }] }),
      listContributors: vi.fn().mockResolvedValue({ data: [{ login: 'octocat' }] }),
      listLanguages: vi.fn().mockResolvedValue({ data: { TypeScript: 1000, JavaScript: 200 } }),
      getCommitActivityStats: vi.fn().mockResolvedValue({ status: 200, data: [{ week: 0, total: 5, days: [0, 1, 1, 1, 1, 1, 0] }] }),
      ...overrides.repos,
    },
    search: {
      issuesAndPullRequests: vi
        .fn()
        .mockResolvedValueOnce({ data: { total_count: 3 } })
        .mockResolvedValueOnce({ data: { total_count: 1 } }),
      ...overrides.search,
    },
  };
}

describe('repoAnalyzeTool', () => {
  it('returns repository metrics and analysis', async () => {
    const rest = buildRest();
    const client = createMockClient({ rest });
    const result = await repoAnalyzeTool.handler({ owner: 'octocat', repo: 'hello-world' }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.repository).toBe('octocat/hello-world');
    expect(result.data.branch).toBe('main');
    expect(result.data.metrics).toMatchObject({ branches: 2, contributors: 1, openIssues: 3, openPRs: 1 });
    expect(result.data.metrics.commitsLastYear).toBeUndefined();
    expect(result.data.analysis).toMatchObject({
      languages: ['TypeScript', 'JavaScript'],
      mainLanguage: 'TypeScript',
      defaultBranch: 'main',
      visibility: 'public',
      stars: 42,
      forks: 7,
      license: 'MIT',
      description: 'A test repository',
    });
    expect(rest.repos.getCommitActivityStats).not.toHaveBeenCalled();
  });

  it('uses the explicit branch input when provided', async () => {
    const client = createMockClient({ rest: buildRest() });
    const result = await repoAnalyzeTool.handler({ owner: 'octocat', repo: 'hello-world', branch: 'dev' }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.branch).toBe('dev');
  });

  it('includes commitsLastYear when deep is true', async () => {
    const rest = buildRest();
    const client = createMockClient({ rest });
    const result = await repoAnalyzeTool.handler({ owner: 'octocat', repo: 'hello-world', deep: true }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.metrics.commitsLastYear).toBe(5);
    expect(rest.repos.getCommitActivityStats).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world' });
  });

  it('omits commitsLastYear when GitHub returns 202 (stats still computing)', async () => {
    const rest = buildRest({ repos: { getCommitActivityStats: vi.fn().mockResolvedValue({ status: 202, data: [] }) } });
    const client = createMockClient({ rest });
    const result = await repoAnalyzeTool.handler({ owner: 'octocat', repo: 'hello-world', deep: true }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.metrics.commitsLastYear).toBeUndefined();
  });

  it('returns a tool error when owner/repo cannot be resolved', async () => {
    const client = createMockClient();
    const result = await repoAnalyzeTool.handler({}, { client });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.errorCode).toBe(GitHubErrorCode.VALIDATION_FAILED);
  });

  it('returns a tool error when the GitHub API call fails', async () => {
    const rest = buildRest({ repos: { get: vi.fn().mockRejectedValue(octokitError(404, 'Not Found')) } });
    const client = createMockClient({ rest });
    const result = await repoAnalyzeTool.handler({ owner: 'octocat', repo: 'missing' }, { client });

    expect(result.success).toBe(false);
    if (result.success) throw new Error('expected failure');
    expect(result.errorCode).toBe(GitHubErrorCode.NOT_FOUND);
  });
});
