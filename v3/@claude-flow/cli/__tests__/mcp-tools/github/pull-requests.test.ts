/**
 * Tests for github_pr_manage (src/mcp-tools/github/pull-requests.ts) online mode.
 *
 * Mocks @octokit/rest so resolveGitHubContext() takes the online branch
 * (GITHUB_TOKEN set + owner/repo provided), then asserts the handler maps
 * Octokit responses into the expected result shape for list/create/review/
 * merge/close, plus error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOctokitMock, type OctokitMock } from './octokit-mock.js';

let octokitMock: OctokitMock;

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function (this: unknown) {
    return octokitMock;
  }),
}));

import { prManageTool } from '../../../src/mcp-tools/github/pull-requests.js';

const OWNER = 'octo-org';
const REPO = 'octo-repo';

function basePR(overrides: Record<string, unknown> = {}) {
  return {
    number: 42,
    title: 'Add feature',
    state: 'open',
    draft: false,
    user: { login: 'alice' },
    head: { ref: 'feature-branch' },
    base: { ref: 'main' },
    html_url: `https://github.com/${OWNER}/${REPO}/pull/42`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    merged_at: null,
    ...overrides,
  };
}

describe('github_pr_manage (online)', () => {
  beforeEach(() => {
    octokitMock = createOctokitMock();
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    vi.clearAllMocks();
  });

  describe('list action', () => {
    it('lists pull requests and maps them to summaries', async () => {
      octokitMock.pulls.list.mockResolvedValue({
        data: [
          basePR(),
          basePR({ number: 43, state: 'closed', title: 'Old PR', merged_at: '2026-01-03T00:00:00Z' }),
        ],
      });

      const result: any = await prManageTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(octokitMock.pulls.list).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, state: 'open', per_page: 100 });
      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.open).toBe(1);
      expect(result.pullRequests[0]).toMatchObject({
        number: 42,
        title: 'Add feature',
        state: 'open',
        draft: false,
        author: 'alice',
        headRef: 'feature-branch',
        baseRef: 'main',
        url: `https://github.com/${OWNER}/${REPO}/pull/42`,
        mergedAt: null,
      });
      expect(result.pullRequests[1]).toMatchObject({ number: 43, state: 'closed', mergedAt: '2026-01-03T00:00:00Z' });
    });

    it('passes through an explicit state filter', async () => {
      octokitMock.pulls.list.mockResolvedValue({ data: [] });

      await prManageTool.handler({ action: 'list', owner: OWNER, repo: REPO, state: 'closed' });

      expect(octokitMock.pulls.list).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, state: 'closed', per_page: 100 });
    });

    it('handles a PR with no associated user', async () => {
      octokitMock.pulls.list.mockResolvedValue({ data: [basePR({ user: null })] });

      const result: any = await prManageTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(result.pullRequests[0].author).toBeNull();
    });
  });

  describe('create action', () => {
    it('creates a pull request and returns the summary plus url', async () => {
      octokitMock.pulls.create.mockResolvedValue({ data: basePR({ title: 'New PR' }) });

      const result: any = await prManageTool.handler({
        action: 'create',
        owner: OWNER,
        repo: REPO,
        title: 'New PR',
        branch: 'feature-branch',
        baseBranch: 'develop',
        body: 'Description',
        draft: true,
      });

      expect(octokitMock.pulls.create).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        title: 'New PR',
        head: 'feature-branch',
        base: 'develop',
        body: 'Description',
        draft: true,
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.pullRequest).toMatchObject({ number: 42, title: 'New PR' });
      expect(result.url).toBe(`https://github.com/${OWNER}/${REPO}/pull/42`);
    });

    it('defaults the base branch to main when baseBranch is omitted', async () => {
      octokitMock.pulls.create.mockResolvedValue({ data: basePR() });

      await prManageTool.handler({ action: 'create', owner: OWNER, repo: REPO, title: 'Title', branch: 'feature' });

      expect(octokitMock.pulls.create).toHaveBeenCalledWith(
        expect.objectContaining({ head: 'feature', base: 'main' }),
      );
    });

    it('returns an error when title or branch is missing', async () => {
      const result: any = await prManageTool.handler({ action: 'create', owner: OWNER, repo: REPO, title: 'Title only' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('title and branch are required');
      expect(octokitMock.pulls.create).not.toHaveBeenCalled();
    });
  });

  describe('review action', () => {
    it('creates a review and returns the result', async () => {
      octokitMock.pulls.createReview.mockResolvedValue({ data: { id: 99, state: 'APPROVED', body: 'LGTM' } });

      const result: any = await prManageTool.handler({
        action: 'review',
        owner: OWNER,
        repo: REPO,
        prNumber: 42,
        reviewEvent: 'APPROVE',
        body: 'LGTM',
      });

      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        pull_number: 42,
        event: 'APPROVE',
        body: 'LGTM',
      });
      expect(result).toEqual({
        success: true,
        action: 'reviewed',
        prNumber: 42,
        review: { id: 99, state: 'APPROVED', body: 'LGTM' },
      });
    });

    it('defaults the review event to COMMENT and body to empty string', async () => {
      octokitMock.pulls.createReview.mockResolvedValue({ data: { id: 1, state: 'COMMENTED', body: null } });

      const result: any = await prManageTool.handler({ action: 'review', owner: OWNER, repo: REPO, prNumber: 7 });

      expect(octokitMock.pulls.createReview).toHaveBeenCalledWith(
        expect.objectContaining({ pull_number: 7, event: 'COMMENT' }),
      );
      expect(result.review.body).toBe('');
    });

    it('returns an error when prNumber is missing', async () => {
      const result: any = await prManageTool.handler({ action: 'review', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('prNumber is required');
    });
  });

  describe('merge action', () => {
    it('merges a pull request and returns merge details', async () => {
      octokitMock.pulls.merge.mockResolvedValue({ data: { merged: true, message: 'Pull Request successfully merged', sha: 'abc123' } });

      const result: any = await prManageTool.handler({
        action: 'merge',
        owner: OWNER,
        repo: REPO,
        prNumber: 42,
        mergeMethod: 'squash',
      });

      expect(octokitMock.pulls.merge).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        pull_number: 42,
        merge_method: 'squash',
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe('merged');
      expect(result.prNumber).toBe(42);
      expect(result.merged).toBe(true);
      expect(result.message).toBe('Pull Request successfully merged');
      expect(result.sha).toBe('abc123');
      expect(typeof result.mergedAt).toBe('string');
    });

    it('returns an error when prNumber is missing', async () => {
      const result: any = await prManageTool.handler({ action: 'merge', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('prNumber is required for merge action');
      expect(octokitMock.pulls.merge).not.toHaveBeenCalled();
    });
  });

  describe('close action', () => {
    it('closes a pull request via pulls.update', async () => {
      octokitMock.pulls.update.mockResolvedValue({ data: {} });

      const result: any = await prManageTool.handler({ action: 'close', owner: OWNER, repo: REPO, prNumber: 42 });

      expect(octokitMock.pulls.update).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, pull_number: 42, state: 'closed' });
      expect(result.success).toBe(true);
      expect(result.action).toBe('closed');
      expect(result.prNumber).toBe(42);
      expect(typeof result.closedAt).toBe('string');
    });

    it('returns an error when prNumber is missing', async () => {
      const result: any = await prManageTool.handler({ action: 'close', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('prNumber is required for close action');
      expect(octokitMock.pulls.update).not.toHaveBeenCalled();
    });
  });

  describe('unknown action', () => {
    it('returns an error for an unrecognized action', async () => {
      const result: any = await prManageTool.handler({ action: 'frobnicate', owner: OWNER, repo: REPO });

      expect(result).toEqual({ success: false, error: 'Unknown action' });
    });
  });

  describe('error handling', () => {
    it('returns formatGitHubError result on Octokit rejection during list', async () => {
      octokitMock.pulls.list.mockRejectedValue({ status: 404, message: 'Not Found' });

      const result: any = await prManageTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('Not Found');
    });

    it('returns formatGitHubError result on Octokit rejection during merge', async () => {
      octokitMock.pulls.merge.mockRejectedValue({ status: 405, message: 'Pull Request is not mergeable' });

      const result: any = await prManageTool.handler({ action: 'merge', owner: OWNER, repo: REPO, prNumber: 42 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Pull Request is not mergeable');
    });
  });
});
