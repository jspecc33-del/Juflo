/**
 * Tests for github_workflow (src/mcp-tools/github/workflows.ts) online mode.
 *
 * Mocks @octokit/rest so resolveGitHubContext() takes the online branch
 * (GITHUB_TOKEN set + owner/repo provided), then asserts the handler maps
 * Octokit responses into the expected result shape for list/trigger/status/
 * cancel, plus error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOctokitMock, type OctokitMock } from './octokit-mock.js';

let octokitMock: OctokitMock;

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function (this: unknown) {
    return octokitMock;
  }),
}));

import { workflowTool } from '../../../src/mcp-tools/github/workflows.js';

const OWNER = 'octo-org';
const REPO = 'octo-repo';

describe('github_workflow (online)', () => {
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
    it('lists workflows mapped from Octokit response', async () => {
      octokitMock.actions.listRepoWorkflows.mockResolvedValue({
        data: {
          workflows: [
            { id: 1, name: 'CI', path: '.github/workflows/ci.yml', state: 'active', html_url: 'https://github.com/o/r/actions/workflows/ci.yml' },
            { id: 2, name: 'Release', path: '.github/workflows/release.yml', state: 'active', html_url: 'https://github.com/o/r/actions/workflows/release.yml' },
          ],
        },
      });

      const result: any = await workflowTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(octokitMock.actions.listRepoWorkflows).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, per_page: 100 });
      expect(result.success).toBe(true);
      expect(result.workflows).toEqual([
        { id: 1, name: 'CI', path: '.github/workflows/ci.yml', status: 'active', url: 'https://github.com/o/r/actions/workflows/ci.yml' },
        { id: 2, name: 'Release', path: '.github/workflows/release.yml', status: 'active', url: 'https://github.com/o/r/actions/workflows/release.yml' },
      ]);
    });
  });

  describe('trigger action', () => {
    it('dispatches a workflow run with default ref and inputs', async () => {
      octokitMock.actions.createWorkflowDispatch.mockResolvedValue({});

      const result: any = await workflowTool.handler({ action: 'trigger', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(octokitMock.actions.createWorkflowDispatch).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        workflow_id: 'ci.yml',
        ref: 'main',
        inputs: undefined,
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe('triggered');
      expect(result.workflowId).toBe('ci.yml');
      expect(result.ref).toBe('main');
      expect(typeof result.triggeredAt).toBe('string');
    });

    it('dispatches a workflow run with explicit ref and inputs', async () => {
      octokitMock.actions.createWorkflowDispatch.mockResolvedValue({});

      const result: any = await workflowTool.handler({
        action: 'trigger',
        owner: OWNER,
        repo: REPO,
        workflowId: 'deploy.yml',
        ref: 'release',
        inputs: { environment: 'production' },
      });

      expect(octokitMock.actions.createWorkflowDispatch).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        workflow_id: 'deploy.yml',
        ref: 'release',
        inputs: { environment: 'production' },
      });
      expect(result.ref).toBe('release');
    });

    it('returns an error when workflowId is missing', async () => {
      const result: any = await workflowTool.handler({ action: 'trigger', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId is required for trigger action');
      expect(octokitMock.actions.createWorkflowDispatch).not.toHaveBeenCalled();
    });
  });

  describe('status action', () => {
    it('returns run status by runId via getWorkflowRun', async () => {
      octokitMock.actions.getWorkflowRun.mockResolvedValue({
        data: {
          workflow_id: 1,
          id: 555,
          status: 'completed',
          conclusion: 'success',
          html_url: 'https://github.com/o/r/actions/runs/555',
        },
      });

      const result: any = await workflowTool.handler({ action: 'status', owner: OWNER, repo: REPO, runId: 555 });

      expect(octokitMock.actions.getWorkflowRun).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, run_id: 555 });
      expect(result).toEqual({
        success: true,
        workflowId: 1,
        runId: 555,
        status: 'completed',
        conclusion: 'success',
        url: 'https://github.com/o/r/actions/runs/555',
      });
    });

    it('returns latest run status by workflowId via listWorkflowRuns', async () => {
      octokitMock.actions.listWorkflowRuns.mockResolvedValue({
        data: {
          workflow_runs: [
            { id: 777, status: 'in_progress', conclusion: null, html_url: 'https://github.com/o/r/actions/runs/777' },
          ],
        },
      });

      const result: any = await workflowTool.handler({ action: 'status', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(octokitMock.actions.listWorkflowRuns).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, workflow_id: 'ci.yml', per_page: 1 });
      expect(result).toEqual({
        success: true,
        workflowId: 'ci.yml',
        runId: 777,
        status: 'in_progress',
        conclusion: null,
        url: 'https://github.com/o/r/actions/runs/777',
      });
    });

    it('returns unknown status when no runs are found for workflowId', async () => {
      octokitMock.actions.listWorkflowRuns.mockResolvedValue({ data: { workflow_runs: [] } });

      const result: any = await workflowTool.handler({ action: 'status', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(result).toEqual({ success: true, workflowId: 'ci.yml', status: 'unknown', conclusion: null });
    });

    it('returns an error when neither workflowId nor runId is provided', async () => {
      const result: any = await workflowTool.handler({ action: 'status', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId or runId is required for status action');
    });
  });

  describe('cancel action', () => {
    it('cancels a run directly when runId is provided', async () => {
      octokitMock.actions.cancelWorkflowRun.mockResolvedValue({});

      const result: any = await workflowTool.handler({ action: 'cancel', owner: OWNER, repo: REPO, runId: 999 });

      expect(octokitMock.actions.cancelWorkflowRun).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, run_id: 999 });
      expect(result.success).toBe(true);
      expect(result.action).toBe('cancelled');
      expect(result.runId).toBe(999);
      expect(typeof result.cancelledAt).toBe('string');
    });

    it('finds an in-progress run by workflowId and cancels it', async () => {
      octokitMock.actions.listWorkflowRuns.mockResolvedValueOnce({
        data: { workflow_runs: [{ id: 111 }] },
      });
      octokitMock.actions.cancelWorkflowRun.mockResolvedValue({});

      const result: any = await workflowTool.handler({ action: 'cancel', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(octokitMock.actions.listWorkflowRuns).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        workflow_id: 'ci.yml',
        status: 'in_progress',
        per_page: 1,
      });
      expect(octokitMock.actions.cancelWorkflowRun).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, run_id: 111 });
      expect(result.success).toBe(true);
      expect(result.runId).toBe(111);
      expect(result.workflowId).toBe('ci.yml');
    });

    it('falls back to a queued run when no in-progress run exists', async () => {
      octokitMock.actions.listWorkflowRuns
        .mockResolvedValueOnce({ data: { workflow_runs: [] } }) // in_progress
        .mockResolvedValueOnce({ data: { workflow_runs: [{ id: 222 }] } }); // queued
      octokitMock.actions.cancelWorkflowRun.mockResolvedValue({});

      const result: any = await workflowTool.handler({ action: 'cancel', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(octokitMock.actions.listWorkflowRuns).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'queued' }),
      );
      expect(octokitMock.actions.cancelWorkflowRun).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, run_id: 222 });
      expect(result.runId).toBe(222);
    });

    it('returns an error when no running workflow is found', async () => {
      octokitMock.actions.listWorkflowRuns.mockResolvedValue({ data: { workflow_runs: [] } });

      const result: any = await workflowTool.handler({ action: 'cancel', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(result).toEqual({ success: false, error: 'No running workflow found to cancel' });
      expect(octokitMock.actions.cancelWorkflowRun).not.toHaveBeenCalled();
    });

    it('returns an error when neither workflowId nor runId is provided', async () => {
      const result: any = await workflowTool.handler({ action: 'cancel', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workflowId or runId is required for cancel action');
    });
  });

  describe('unknown action', () => {
    it('returns an error for an unrecognized action', async () => {
      const result: any = await workflowTool.handler({ action: 'frobnicate', owner: OWNER, repo: REPO });

      expect(result).toEqual({ success: false, error: 'Unknown action' });
    });
  });

  describe('error handling', () => {
    it('returns formatGitHubError result on Octokit rejection during list', async () => {
      octokitMock.actions.listRepoWorkflows.mockRejectedValue({ status: 404, message: 'Not Found' });

      const result: any = await workflowTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('Not Found');
    });

    it('returns formatGitHubError result on Octokit rejection during trigger', async () => {
      octokitMock.actions.createWorkflowDispatch.mockRejectedValue({ status: 422, message: 'Workflow does not have workflow_dispatch trigger' });

      const result: any = await workflowTool.handler({ action: 'trigger', owner: OWNER, repo: REPO, workflowId: 'ci.yml' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workflow does not have workflow_dispatch trigger');
    });
  });
});
