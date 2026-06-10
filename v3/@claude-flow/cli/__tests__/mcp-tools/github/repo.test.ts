/**
 * Tests for github_repo_analyze (src/mcp-tools/github/repo.ts) online mode.
 *
 * Mocks @octokit/rest so resolveGitHubContext() takes the online branch
 * (GITHUB_TOKEN set + owner/repo provided), then asserts the handler maps
 * Octokit responses into the expected result shape for both basic and deep
 * analysis, plus error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOctokitMock, type OctokitMock } from './octokit-mock.js';

let octokitMock: OctokitMock;

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function (this: unknown) {
    return octokitMock;
  }),
}));

import { repoAnalyzeTool } from '../../../src/mcp-tools/github/repo.js';

describe('github_repo_analyze (online)', () => {
  beforeEach(() => {
    octokitMock = createOctokitMock();
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    vi.clearAllMocks();
  });

  it('returns basic analysis using Octokit data', async () => {
    octokitMock.repos.get.mockResolvedValue({
      data: {
        default_branch: 'main',
        visibility: 'public',
        private: false,
        stargazers_count: 42,
        forks_count: 7,
        license: { spdx_id: 'MIT' },
        description: 'A test repo',
      },
    });
    octokitMock.repos.listLanguages.mockResolvedValue({ data: { TypeScript: 1000, JavaScript: 200 } });
    octokitMock.repos.listBranches.mockResolvedValue({ data: [{ name: 'main' }, { name: 'dev' }] });
    octokitMock.repos.listContributors.mockResolvedValue({ data: [{ login: 'alice' }, { login: 'bob' }] });
    octokitMock.search.issuesAndPullRequests
      .mockResolvedValueOnce({ data: { total_count: 5, items: [] } }) // issues
      .mockResolvedValueOnce({ data: { total_count: 2, items: [] } }); // PRs

    const result: any = await repoAnalyzeTool.handler({ owner: 'octo-org', repo: 'octo-repo' });

    expect(octokitMock.repos.get).toHaveBeenCalledWith({ owner: 'octo-org', repo: 'octo-repo' });
    expect(octokitMock.repos.listLanguages).toHaveBeenCalledWith({ owner: 'octo-org', repo: 'octo-repo' });
    expect(octokitMock.repos.listBranches).toHaveBeenCalledWith({ owner: 'octo-org', repo: 'octo-repo', per_page: 100 });
    expect(octokitMock.repos.listContributors).toHaveBeenCalledWith({ owner: 'octo-org', repo: 'octo-repo', per_page: 100 });
    expect(octokitMock.search.issuesAndPullRequests).toHaveBeenCalledWith({
      q: 'repo:octo-org/octo-repo is:issue is:open',
      per_page: 1,
    });
    expect(octokitMock.search.issuesAndPullRequests).toHaveBeenCalledWith({
      q: 'repo:octo-org/octo-repo is:pr is:open',
      per_page: 1,
    });
    // Deep analysis (commit activity) should NOT be fetched for basic analysis
    expect(octokitMock.repos.getCommitActivityStats).not.toHaveBeenCalled();

    expect(result.success).toBe(true);
    expect(result.repository).toBe('octo-org/octo-repo');
    expect(result.branch).toBe('main');
    expect(result.metrics).toEqual({
      branches: 2,
      contributors: 2,
      openIssues: 5,
      openPRs: 2,
    });
    expect(result.analysis).toMatchObject({
      languages: ['TypeScript', 'JavaScript'],
      mainLanguage: 'TypeScript',
      defaultBranch: 'main',
      visibility: 'public',
      stars: 42,
      forks: 7,
      license: 'MIT',
      description: 'A test repo',
    });
    expect(typeof result.lastAnalyzed).toBe('string');
  });

  it('uses an explicit branch override and visibility derived from private flag', async () => {
    octokitMock.repos.get.mockResolvedValue({
      data: {
        default_branch: 'main',
        private: true,
        stargazers_count: 0,
        forks_count: 0,
        license: null,
        description: null,
      },
    });
    octokitMock.repos.listLanguages.mockResolvedValue({ data: {} });
    octokitMock.repos.listBranches.mockResolvedValue({ data: [] });
    octokitMock.repos.listContributors.mockResolvedValue({ data: [] });
    octokitMock.search.issuesAndPullRequests
      .mockResolvedValueOnce({ data: { total_count: 0, items: [] } })
      .mockResolvedValueOnce({ data: { total_count: 0, items: [] } });

    const result: any = await repoAnalyzeTool.handler({ owner: 'octo-org', repo: 'octo-repo', branch: 'release' });

    expect(result.branch).toBe('release');
    expect(result.analysis.visibility).toBe('private');
    expect(result.analysis.mainLanguage).toBe('Unknown');
    expect(result.analysis.license).toBeNull();
  });

  it('performs deep analysis including commit activity stats', async () => {
    octokitMock.repos.get.mockResolvedValue({
      data: {
        default_branch: 'main',
        visibility: 'public',
        stargazers_count: 1,
        forks_count: 1,
        license: null,
        description: 'desc',
      },
    });
    octokitMock.repos.listLanguages.mockResolvedValue({ data: { Python: 500 } });
    octokitMock.repos.listBranches.mockResolvedValue({ data: [{ name: 'main' }] });
    octokitMock.repos.listContributors.mockResolvedValue({ data: [{ login: 'carol' }] });
    octokitMock.search.issuesAndPullRequests
      .mockResolvedValueOnce({ data: { total_count: 1, items: [] } })
      .mockResolvedValueOnce({ data: { total_count: 0, items: [] } });
    octokitMock.repos.getCommitActivityStats.mockResolvedValue({
      status: 200,
      data: [{ total: 10 }, { total: 20 }, { total: 5 }],
    });

    const result: any = await repoAnalyzeTool.handler({ owner: 'octo-org', repo: 'octo-repo', deep: true });

    expect(octokitMock.repos.getCommitActivityStats).toHaveBeenCalledWith({ owner: 'octo-org', repo: 'octo-repo' });
    expect(result.success).toBe(true);
    expect(result.metrics.commitsLastYear).toBe(35);
  });

  it('omits commitsLastYear when deep analysis returns non-200 status', async () => {
    octokitMock.repos.get.mockResolvedValue({
      data: { default_branch: 'main', visibility: 'public', stargazers_count: 0, forks_count: 0, license: null, description: null },
    });
    octokitMock.repos.listLanguages.mockResolvedValue({ data: {} });
    octokitMock.repos.listBranches.mockResolvedValue({ data: [] });
    octokitMock.repos.listContributors.mockResolvedValue({ data: [] });
    octokitMock.search.issuesAndPullRequests
      .mockResolvedValueOnce({ data: { total_count: 0, items: [] } })
      .mockResolvedValueOnce({ data: { total_count: 0, items: [] } });
    octokitMock.repos.getCommitActivityStats.mockResolvedValue({ status: 202, data: [] });

    const result: any = await repoAnalyzeTool.handler({ owner: 'octo-org', repo: 'octo-repo', deep: true });

    expect(result.success).toBe(true);
    expect(result.metrics.commitsLastYear).toBeUndefined();
  });

  it('returns formatGitHubError result on Octokit rejection', async () => {
    octokitMock.repos.get.mockRejectedValue({ status: 404, message: 'Not Found' });

    const result: any = await repoAnalyzeTool.handler({ owner: 'octo-org', repo: 'missing-repo' });

    expect(result.success).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error).toContain('Not Found');
  });
});
