import { describe, it, expect, vi } from 'vitest';
import { workflowTool } from '../../src/tools/workflows.js';
import { GitHubErrorCode } from '../../src/errors.js';
import { createMockClient } from '../helpers/mock-client.js';

const sampleRun = {
  id: 555,
  name: 'CI',
  status: 'in_progress',
  conclusion: null,
  head_branch: 'main',
  html_url: 'https://github.com/octocat/hello-world/actions/runs/555',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:05:00Z',
};

describe('workflowTool', () => {
  describe('list', () => {
    it('lists repository workflows', async () => {
      const listRepoWorkflows = vi.fn().mockResolvedValue({
        data: { workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', html_url: 'https://github.com/octocat/hello-world/actions/workflows/ci.yml' }] },
      });
      const client = createMockClient({ rest: { actions: { listRepoWorkflows } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'list' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'list', workflows: [{ id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', url: 'https://github.com/octocat/hello-world/actions/workflows/ci.yml' }] });
    });
  });

  describe('trigger', () => {
    it('requires authentication', async () => {
      const client = createMockClient({ authenticated: false });
      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'trigger', workflowId: 'ci.yml' }, { client });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.errorCode).toBe(GitHubErrorCode.AUTH_REQUIRED);
    });

    it('dispatches a workflow against the default branch when ref is omitted', async () => {
      const get = vi.fn().mockResolvedValue({ data: { default_branch: 'main' } });
      const createWorkflowDispatch = vi.fn().mockResolvedValue({});
      const client = createMockClient({ authenticated: true, rest: { repos: { get }, actions: { createWorkflowDispatch } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'trigger', workflowId: 'ci.yml', inputs: { foo: 'bar' } }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'triggered', workflowId: 'ci.yml', ref: 'main' });
      expect(createWorkflowDispatch).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', workflow_id: 'ci.yml', ref: 'main', inputs: { foo: 'bar' } });
    });

    it('uses an explicit ref without fetching the default branch', async () => {
      const get = vi.fn();
      const createWorkflowDispatch = vi.fn().mockResolvedValue({});
      const client = createMockClient({ authenticated: true, rest: { repos: { get }, actions: { createWorkflowDispatch } } });

      await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'trigger', workflowId: 'ci.yml', ref: 'develop' }, { client });

      expect(get).not.toHaveBeenCalled();
      expect(createWorkflowDispatch).toHaveBeenCalledWith(expect.objectContaining({ ref: 'develop' }));
    });
  });

  describe('status', () => {
    it('returns the latest run for a workflow', async () => {
      const listWorkflowRuns = vi.fn().mockResolvedValue({ data: { workflow_runs: [sampleRun] } });
      const client = createMockClient({ rest: { actions: { listWorkflowRuns } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'status', workflowId: 'ci.yml' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      if (result.data.action !== 'status') throw new Error('expected status result');
      expect(result.data.run).toMatchObject({ id: 555, status: 'in_progress', headBranch: 'main' });
      expect(listWorkflowRuns).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', workflow_id: 'ci.yml', per_page: 1 });
    });

    it('returns null when no runs exist', async () => {
      const listWorkflowRuns = vi.fn().mockResolvedValue({ data: { workflow_runs: [] } });
      const client = createMockClient({ rest: { actions: { listWorkflowRuns } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'status', workflowId: 'ci.yml' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      if (result.data.action !== 'status') throw new Error('expected status result');
      expect(result.data.run).toBeNull();
    });
  });

  describe('cancel', () => {
    it('requires authentication', async () => {
      const client = createMockClient({ authenticated: false });
      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'cancel', runId: 555 }, { client });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.errorCode).toBe(GitHubErrorCode.AUTH_REQUIRED);
    });

    it('cancels a run by explicit runId without listing runs', async () => {
      const cancelWorkflowRun = vi.fn().mockResolvedValue({});
      const listWorkflowRuns = vi.fn();
      const client = createMockClient({ authenticated: true, rest: { actions: { cancelWorkflowRun, listWorkflowRuns } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'cancel', runId: 555 }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'cancelled', runId: 555 });
      expect(listWorkflowRuns).not.toHaveBeenCalled();
      expect(cancelWorkflowRun).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', run_id: 555 });
    });

    it('finds and cancels the latest queued/in-progress run for a workflowId', async () => {
      const listWorkflowRuns = vi.fn().mockResolvedValue({ data: { workflow_runs: [sampleRun] } });
      const cancelWorkflowRun = vi.fn().mockResolvedValue({});
      const client = createMockClient({ authenticated: true, rest: { actions: { listWorkflowRuns, cancelWorkflowRun } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'cancel', workflowId: 'ci.yml' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'cancelled', runId: 555 });
      expect(cancelWorkflowRun).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', run_id: 555 });
    });

    it('fails with NOT_FOUND when no queued/in-progress run exists', async () => {
      const listWorkflowRuns = vi.fn().mockResolvedValue({ data: { workflow_runs: [{ ...sampleRun, status: 'completed' }] } });
      const client = createMockClient({ authenticated: true, rest: { actions: { listWorkflowRuns } } });

      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'cancel', workflowId: 'ci.yml' }, { client });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.errorCode).toBe(GitHubErrorCode.NOT_FOUND);
    });

    it('fails with VALIDATION_FAILED when neither runId nor workflowId is given', async () => {
      const client = createMockClient({ authenticated: true });
      const result = await workflowTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'cancel' }, { client });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.errorCode).toBe(GitHubErrorCode.VALIDATION_FAILED);
    });
  });
});
