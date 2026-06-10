import { describe, it, expect, vi } from 'vitest';
import { prManageTool } from '../../src/tools/pull-requests.js';
import { GitHubErrorCode } from '../../src/errors.js';
import { createMockClient } from '../helpers/mock-client.js';

const samplePR = {
  number: 7,
  title: 'Add feature',
  state: 'open',
  draft: false,
  user: { login: 'octocat' },
  head: { ref: 'feature/foo' },
  base: { ref: 'main' },
  html_url: 'https://github.com/octocat/hello-world/pull/7',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  merged_at: null,
};

describe('prManageTool', () => {
  describe('list', () => {
    it('lists pull requests and summarizes counts', async () => {
      const list = vi.fn().mockResolvedValue({ data: [samplePR, { ...samplePR, number: 8, state: 'closed' }] });
      const client = createMockClient({ rest: { pulls: { list } } });

      const result = await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'list' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toMatchObject({ action: 'list', total: 2, open: 1 });
      if (result.data.action !== 'list') throw new Error('expected list result');
      expect(result.data.pullRequests[0]).toMatchObject({ number: 7, title: 'Add feature', author: 'octocat', headRef: 'feature/foo', baseRef: 'main' });
      expect(list).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', state: 'open', per_page: 50 });
    });
  });

  describe('create', () => {
    it('requires authentication', async () => {
      const client = createMockClient({ authenticated: false });
      const result = await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'create', title: 'Add feature', branch: 'feature/foo' }, { client });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.errorCode).toBe(GitHubErrorCode.AUTH_REQUIRED);
    });

    it('creates a pull request against the default branch when baseBranch is omitted', async () => {
      const get = vi.fn().mockResolvedValue({ data: { default_branch: 'main' } });
      const create = vi.fn().mockResolvedValue({ data: samplePR });
      const client = createMockClient({ authenticated: true, rest: { repos: { get }, pulls: { create } } });

      const result = await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'create', title: 'Add feature', branch: 'feature/foo' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toMatchObject({ action: 'created' });
      expect(get).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world' });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'octocat', repo: 'hello-world', title: 'Add feature', head: 'feature/foo', base: 'main' }));
    });

    it('uses an explicit baseBranch without fetching the default branch', async () => {
      const get = vi.fn();
      const create = vi.fn().mockResolvedValue({ data: samplePR });
      const client = createMockClient({ authenticated: true, rest: { repos: { get }, pulls: { create } } });

      await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'create', title: 'Add feature', branch: 'feature/foo', baseBranch: 'develop' }, { client });

      expect(get).not.toHaveBeenCalled();
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ base: 'develop' }));
    });
  });

  describe('review', () => {
    it('submits a pull request review', async () => {
      const createReview = vi.fn().mockResolvedValue({ data: { id: 99, state: 'APPROVED', submitted_at: '2026-01-03T00:00:00Z' } });
      const client = createMockClient({ authenticated: true, rest: { pulls: { createReview } } });

      const result = await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'review', prNumber: 7, reviewEvent: 'APPROVE' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toMatchObject({ action: 'reviewed', prNumber: 7, review: { id: 99, state: 'APPROVED' } });
      expect(createReview).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 7, event: 'APPROVE' }));
    });
  });

  describe('merge', () => {
    it('merges a pull request', async () => {
      const merge = vi.fn().mockResolvedValue({ data: { merged: true, message: 'Pull Request successfully merged', sha: 'abc123' } });
      const client = createMockClient({ authenticated: true, rest: { pulls: { merge } } });

      const result = await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'merge', prNumber: 7, mergeMethod: 'squash' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'merged', prNumber: 7, merged: true, message: 'Pull Request successfully merged', sha: 'abc123' });
      expect(merge).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 7, merge_method: 'squash' }));
    });
  });

  describe('close', () => {
    it('closes a pull request', async () => {
      const update = vi.fn().mockResolvedValue({ data: { ...samplePR, state: 'closed', closed_at: '2026-01-04T00:00:00Z' } });
      const client = createMockClient({ authenticated: true, rest: { pulls: { update } } });

      const result = await prManageTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'close', prNumber: 7 }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'closed', prNumber: 7, closedAt: '2026-01-04T00:00:00Z' });
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ pull_number: 7, state: 'closed' }));
    });
  });
});
