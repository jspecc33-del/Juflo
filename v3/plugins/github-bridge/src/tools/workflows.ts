/**
 * GitHub Bridge Plugin - GitHub Actions Workflow Tool
 *
 * `github_workflow`: list workflows, dispatch a workflow run, check the
 * latest run's status, or cancel an in-progress run.
 *
 * @module github-bridge/tools/workflows
 */

import type { MCPTool, ToolContext } from '../types.js';
import { WorkflowInputSchema, type WorkflowInput } from '../validators.js';
import { GitHubBridgeError, GitHubErrorCode, toToolError } from '../errors.js';

export interface WorkflowSummary {
  id: number;
  name: string;
  path: string;
  state: string;
  url: string;
}

export interface WorkflowRunSummary {
  id: number;
  name: string | null;
  status: string | null;
  conclusion: string | null;
  headBranch: string | null;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowResult =
  | { action: 'list'; workflows: WorkflowSummary[] }
  | { action: 'triggered'; workflowId: string | number; ref: string }
  | { action: 'status'; workflowId: string | number; run: WorkflowRunSummary | null }
  | { action: 'cancelled'; runId: number };

export const workflowTool: MCPTool<WorkflowInput, WorkflowResult> = {
  name: 'github_workflow',
  description: 'List, trigger, check the status of, or cancel GitHub Actions workflows.',
  category: 'github',
  mutating: true,
  inputSchema: WorkflowInputSchema,
  handler: async (input, { client }) => {
    try {
      const { owner, repo } = client.resolveRepo(input);

      switch (input.action) {
        case 'list':
          return { success: true, data: await listWorkflows(client, owner, repo) };
        case 'trigger':
          client.requireAuth('trigger a workflow');
          return { success: true, data: await triggerWorkflow(client, owner, repo, input) };
        case 'status':
          return { success: true, data: await workflowStatus(client, owner, repo, input) };
        case 'cancel':
          client.requireAuth('cancel a workflow run');
          return { success: true, data: await cancelWorkflow(client, owner, repo, input) };
      }
    } catch (error) {
      return toToolError(error);
    }
  },
};

async function listWorkflows(client: ToolContext['client'], owner: string, repo: string): Promise<WorkflowResult> {
  const workflows = await client.execute('listing workflows', () =>
    client.octokit.rest.actions.listRepoWorkflows({ owner, repo, per_page: 100 }).then((r) => r.data.workflows),
  );

  return {
    action: 'list',
    workflows: workflows.map((w) => ({ id: w.id, name: w.name, path: w.path, state: w.state, url: w.html_url })),
  };
}

async function triggerWorkflow(client: ToolContext['client'], owner: string, repo: string, input: WorkflowInput): Promise<WorkflowResult> {
  const ref = input.ref ?? (await client.execute<string>('fetching default branch', () => client.octokit.rest.repos.get({ owner, repo }).then((r) => r.data.default_branch)));

  await client.execute('dispatching workflow', () =>
    client.octokit.rest.actions.createWorkflowDispatch({ owner, repo, workflow_id: input.workflowId!, ref, inputs: input.inputs }),
  );

  return { action: 'triggered', workflowId: input.workflowId!, ref };
}

async function workflowStatus(client: ToolContext['client'], owner: string, repo: string, input: WorkflowInput): Promise<WorkflowResult> {
  const run = await latestRun(client, owner, repo, input.workflowId!);

  return {
    action: 'status',
    workflowId: input.workflowId!,
    run: run
      ? {
          id: run.id,
          name: run.name ?? null,
          status: run.status,
          conclusion: run.conclusion,
          headBranch: run.head_branch,
          url: run.html_url,
          createdAt: run.created_at,
          updatedAt: run.updated_at,
        }
      : null,
  };
}

async function cancelWorkflow(client: ToolContext['client'], owner: string, repo: string, input: WorkflowInput): Promise<WorkflowResult> {
  let runId = input.runId;

  if (runId === undefined) {
    if (input.workflowId === undefined) {
      throw new GitHubBridgeError('Either runId or workflowId is required to cancel a workflow run', GitHubErrorCode.VALIDATION_FAILED);
    }
    const run = await latestRun(client, owner, repo, input.workflowId, ['queued', 'in_progress']);
    if (!run) {
      throw new GitHubBridgeError(`No queued or in-progress run found for workflow "${input.workflowId}"`, GitHubErrorCode.NOT_FOUND);
    }
    runId = run.id;
  }

  await client.execute('cancelling workflow run', () => client.octokit.rest.actions.cancelWorkflowRun({ owner, repo, run_id: runId! }));

  return { action: 'cancelled', runId };
}

async function latestRun(client: ToolContext['client'], owner: string, repo: string, workflowId: string | number, statuses?: Array<'queued' | 'in_progress'>) {
  const runs = await client.execute('listing workflow runs', () =>
    client.octokit.rest.actions.listWorkflowRuns({ owner, repo, workflow_id: workflowId, per_page: statuses ? 20 : 1 }).then((r) => r.data.workflow_runs),
  );

  if (!statuses) {
    return runs[0];
  }
  return runs.find((run) => statuses.some((status) => status === run.status));
}
