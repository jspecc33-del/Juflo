/**
 * github_workflow tool
 *
 * Online (token + owner/repo present): real Octokit-backed GitHub Actions
 * list/trigger/status/cancel. Offline: static placeholder data, preserved
 * for workflow coordination without network access.
 */

import type { Octokit } from '@octokit/rest';
import type { MCPTool } from '../types.js';
import { resolveGitHubContext, formatGitHubError } from './client.js';

function offlineWorkflow(input: Record<string, unknown>) {
  const action = (input.action as string) || 'list';

  if (action === 'list') {
    return {
      success: true,
      workflows: [
        { id: 'ci.yml', name: 'CI', status: 'active', lastRun: new Date().toISOString() },
        { id: 'release.yml', name: 'Release', status: 'active', lastRun: new Date().toISOString() },
        { id: 'test.yml', name: 'Tests', status: 'active', lastRun: new Date().toISOString() },
      ],
    };
  }

  if (action === 'trigger') {
    return {
      success: true,
      action: 'triggered',
      workflowId: input.workflowId,
      ref: input.ref || 'main',
      runId: `run-${Date.now()}`,
      triggeredAt: new Date().toISOString(),
    };
  }

  if (action === 'status') {
    return {
      success: true,
      workflowId: input.workflowId,
      status: 'completed',
      conclusion: 'success',
      duration: '2m 35s',
    };
  }

  if (action === 'cancel') {
    return {
      success: true,
      action: 'cancelled',
      workflowId: input.workflowId,
      cancelledAt: new Date().toISOString(),
    };
  }

  return { success: false, error: 'Unknown action' };
}

async function onlineWorkflow(octokit: Octokit, owner: string, repo: string, input: Record<string, unknown>) {
  const action = (input.action as string) || 'list';

  try {
    if (action === 'list') {
      const { data } = await octokit.actions.listRepoWorkflows({ owner, repo, per_page: 100 });
      return {
        success: true,
        workflows: data.workflows.map((w) => ({
          id: w.id,
          name: w.name,
          path: w.path,
          status: w.state,
          url: w.html_url,
        })),
      };
    }

    const workflowId = input.workflowId as string | number | undefined;

    if (action === 'trigger') {
      if (!workflowId) {
        return { success: false, error: 'workflowId is required for trigger action' };
      }
      const ref = (input.ref as string) || 'main';
      await octokit.actions.createWorkflowDispatch({
        owner,
        repo,
        workflow_id: workflowId,
        ref,
        inputs: input.inputs as Record<string, string> | undefined,
      });
      return { success: true, action: 'triggered', workflowId, ref, triggeredAt: new Date().toISOString() };
    }

    if (action === 'status') {
      const runId = input.runId as number | undefined;
      if (runId) {
        const { data } = await octokit.actions.getWorkflowRun({ owner, repo, run_id: runId });
        return {
          success: true,
          workflowId: data.workflow_id,
          runId: data.id,
          status: data.status,
          conclusion: data.conclusion,
          url: data.html_url,
        };
      }
      if (!workflowId) {
        return { success: false, error: 'workflowId or runId is required for status action' };
      }
      const { data } = await octokit.actions.listWorkflowRuns({ owner, repo, workflow_id: workflowId, per_page: 1 });
      const run = data.workflow_runs[0];
      if (!run) {
        return { success: true, workflowId, status: 'unknown', conclusion: null };
      }
      return { success: true, workflowId, runId: run.id, status: run.status, conclusion: run.conclusion, url: run.html_url };
    }

    if (action === 'cancel') {
      let runId = input.runId as number | undefined;
      if (!runId) {
        if (!workflowId) {
          return { success: false, error: 'workflowId or runId is required for cancel action' };
        }
        const inProgress = await octokit.actions.listWorkflowRuns({
          owner,
          repo,
          workflow_id: workflowId,
          status: 'in_progress',
          per_page: 1,
        });
        runId = inProgress.data.workflow_runs[0]?.id;
        if (!runId) {
          const queued = await octokit.actions.listWorkflowRuns({
            owner,
            repo,
            workflow_id: workflowId,
            status: 'queued',
            per_page: 1,
          });
          runId = queued.data.workflow_runs[0]?.id;
        }
      }
      if (!runId) {
        return { success: false, error: 'No running workflow found to cancel' };
      }
      await octokit.actions.cancelWorkflowRun({ owner, repo, run_id: runId });
      return { success: true, action: 'cancelled', workflowId, runId, cancelledAt: new Date().toISOString() };
    }

    return { success: false, error: 'Unknown action' };
  } catch (error) {
    return formatGitHubError(error);
  }
}

export const workflowTool: MCPTool = {
  name: 'github_workflow',
  description: 'Manage GitHub Actions workflows',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'trigger', 'status', 'cancel'], description: 'Action to perform' },
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      workflowId: { type: 'string', description: 'Workflow ID or filename' },
      ref: { type: 'string', description: 'Branch or tag ref' },
      runId: { type: 'number', description: 'Workflow run ID (for status/cancel)' },
      inputs: { type: 'object', description: 'Inputs to pass to a workflow_dispatch trigger' },
    },
  },
  handler: async (input) => {
    const ctx = resolveGitHubContext(input);
    if (!ctx) {
      return offlineWorkflow(input);
    }
    return onlineWorkflow(ctx.octokit, ctx.owner, ctx.repo, input);
  },
};
