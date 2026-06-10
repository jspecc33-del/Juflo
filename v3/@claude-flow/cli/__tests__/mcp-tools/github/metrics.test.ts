/**
 * Tests for github_metrics (src/mcp-tools/github/metrics.ts) online mode.
 *
 * Mocks @octokit/rest so resolveGitHubContext() takes the online branch
 * (GITHUB_TOKEN set + owner/repo provided), then asserts the handler maps
 * Octokit responses into the expected result shape for the "all" metric and
 * each individual metric (commits/contributors/traffic/releases), plus
 * error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOctokitMock, type OctokitMock } from './octokit-mock.js';

let octokitMock: OctokitMock;

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function (this: unknown) {
    return octokitMock;
  }),
}));

import { metricsTool } from '../../../src/mcp-tools/github/metrics.js';

const OWNER = 'octo-org';
const REPO = 'octo-repo';

function setUpAllMocks(): void {
  octokitMock.repos.getCommitActivityStats.mockResolvedValue({
    status: 200,
    data: [{ total: 10 }, { total: 20 }, { total: 30 }, { total: 40 }, { total: 5 }],
  });
  octokitMock.repos.listContributors.mockResolvedValue({
    data: [
      { login: 'alice', contributions: 100 },
      { login: 'bob', contributions: 50 },
    ],
  });
  octokitMock.repos.getViews.mockResolvedValue({ data: { count: 1000, uniques: 200 } });
  octokitMock.repos.getClones.mockResolvedValue({ data: { count: 300, uniques: 75 } });
  octokitMock.repos.listReleases.mockResolvedValue({
    data: [
      { tag_name: 'v2.0.0', assets: [{ download_count: 100 }, { download_count: 50 }] },
      { tag_name: 'v1.0.0', assets: [{ download_count: 25 }] },
    ],
  });
}

describe('github_metrics (online)', () => {
  beforeEach(() => {
    octokitMock = createOctokitMock();
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    vi.clearAllMocks();
  });

  describe('metric=all (default)', () => {
    it('fetches and aggregates commits, contributors, traffic, and releases', async () => {
      setUpAllMocks();

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO });

      expect(octokitMock.repos.getCommitActivityStats).toHaveBeenCalledWith({ owner: OWNER, repo: REPO });
      expect(octokitMock.repos.listContributors).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, per_page: 100 });
      expect(octokitMock.repos.getViews).toHaveBeenCalledWith({ owner: OWNER, repo: REPO });
      expect(octokitMock.repos.getClones).toHaveBeenCalledWith({ owner: OWNER, repo: REPO });
      expect(octokitMock.repos.listReleases).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, per_page: 20 });

      expect(result.success).toBe(true);
      expect(result.repository).toBe(`${OWNER}/${REPO}`);
      expect(typeof result.generatedAt).toBe('string');
      expect(result.metrics.commits).toEqual({ total: 105, lastWeek: 5, lastMonth: 95 });
      expect(result.metrics.contributors).toEqual({ total: 2, topContributor: 'alice', totalContributions: 150 });
      expect(result.metrics.traffic).toEqual({ views: 1000, uniqueVisitors: 200, clones: 300, uniqueCloners: 75 });
      expect(result.metrics.releases).toEqual({ total: 2, latest: 'v2.0.0', downloads: 175 });
    });

    it('honors metric=all explicitly passed in input', async () => {
      setUpAllMocks();

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'all' });

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metric).toBeUndefined();
    });

    it('returns empty traffic object when traffic endpoints are forbidden (403)', async () => {
      setUpAllMocks();
      octokitMock.repos.getViews.mockRejectedValue({ status: 403, message: 'Forbidden' });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO });

      expect(result.success).toBe(true);
      expect(result.metrics.traffic).toEqual({});
    });

    it('returns commits as zeroes when commit activity stats are unavailable (non-200)', async () => {
      setUpAllMocks();
      octokitMock.repos.getCommitActivityStats.mockResolvedValue({ status: 202, data: [] });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO });

      expect(result.metrics.commits).toEqual({ total: 0, lastWeek: 0, lastMonth: 0 });
    });
  });

  describe('metric=commits', () => {
    it('fetches only commit metrics', async () => {
      setUpAllMocks();

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'commits' });

      expect(octokitMock.repos.getCommitActivityStats).toHaveBeenCalledWith({ owner: OWNER, repo: REPO });
      expect(octokitMock.repos.listContributors).not.toHaveBeenCalled();
      expect(octokitMock.repos.getViews).not.toHaveBeenCalled();
      expect(octokitMock.repos.listReleases).not.toHaveBeenCalled();

      expect(result.success).toBe(true);
      expect(result.repository).toBe(`${OWNER}/${REPO}`);
      expect(result.metric).toBe('commits');
      expect(result.data).toEqual({ total: 105, lastWeek: 5, lastMonth: 95 });
      expect(typeof result.generatedAt).toBe('string');
    });
  });

  describe('metric=contributors', () => {
    it('fetches only contributor metrics', async () => {
      setUpAllMocks();

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'contributors' });

      expect(octokitMock.repos.listContributors).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, per_page: 100 });
      expect(octokitMock.repos.getCommitActivityStats).not.toHaveBeenCalled();

      expect(result.success).toBe(true);
      expect(result.metric).toBe('contributors');
      expect(result.data).toEqual({ total: 2, topContributor: 'alice', totalContributions: 150 });
    });

    it('returns null topContributor when there are no contributors', async () => {
      octokitMock.repos.listContributors.mockResolvedValue({ data: [] });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'contributors' });

      expect(result.data).toEqual({ total: 0, topContributor: null, totalContributions: 0 });
    });
  });

  describe('metric=traffic', () => {
    it('fetches only traffic metrics', async () => {
      setUpAllMocks();

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'traffic' });

      expect(octokitMock.repos.getViews).toHaveBeenCalledWith({ owner: OWNER, repo: REPO });
      expect(octokitMock.repos.getClones).toHaveBeenCalledWith({ owner: OWNER, repo: REPO });
      expect(octokitMock.repos.getCommitActivityStats).not.toHaveBeenCalled();

      expect(result.success).toBe(true);
      expect(result.metric).toBe('traffic');
      expect(result.data).toEqual({ views: 1000, uniqueVisitors: 200, clones: 300, uniqueCloners: 75 });
    });

    it('rethrows non-403/404/401 errors as a formatGitHubError result', async () => {
      octokitMock.repos.getViews.mockRejectedValue({ status: 500, message: 'Internal Server Error' });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'traffic' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Internal Server Error');
    });
  });

  describe('metric=releases', () => {
    it('fetches only release metrics', async () => {
      setUpAllMocks();

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'releases' });

      expect(octokitMock.repos.listReleases).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, per_page: 20 });
      expect(octokitMock.repos.getCommitActivityStats).not.toHaveBeenCalled();

      expect(result.success).toBe(true);
      expect(result.metric).toBe('releases');
      expect(result.data).toEqual({ total: 2, latest: 'v2.0.0', downloads: 175 });
    });

    it('returns null latest and zero downloads when there are no releases', async () => {
      octokitMock.repos.listReleases.mockResolvedValue({ data: [] });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'releases' });

      expect(result.data).toEqual({ total: 0, latest: null, downloads: 0 });
    });
  });

  describe('error handling', () => {
    it('returns formatGitHubError result on Octokit rejection', async () => {
      octokitMock.repos.getCommitActivityStats.mockRejectedValue({ status: 404, message: 'Not Found' });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO, metric: 'commits' });

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('Not Found');
    });

    it('returns formatGitHubError result on Octokit rejection for metric=all', async () => {
      setUpAllMocks();
      octokitMock.repos.listReleases.mockRejectedValue({ status: 403, message: 'API rate limit exceeded' });

      const result: any = await metricsTool.handler({ owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('API rate limit exceeded');
    });
  });
});
