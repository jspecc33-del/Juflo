/**
 * GitHub Bridge Plugin - Pull Request Management Tool
 *
 * `github_pr_manage`: list, create, review, merge, and close pull requests
 * via the GitHub REST API.
 *
 * @module github-bridge/tools/pull-requests
 */

import type { MCPTool, ToolContext } from '../types.js';
import { PRManageInputSchema, type PRManageInput } from '../validators.js';
import { toToolError } from '../errors.js';

export interface PRSummary {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  author: string | null;
  headRef: string;
  baseRef: string;
  url: string;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export type PRManageResult =
  | { action: 'list'; pullRequests: PRSummary[]; total: number; open: number }
  | { action: 'created'; pullRequest: PRSummary }
  | { action: 'reviewed'; prNumber: number; review: { id: number; state: string; submittedAt: string | null } }
  | { action: 'merged'; prNumber: number; merged: boolean; message: string; sha?: string }
  | { action: 'closed'; prNumber: number; closedAt: string | null };

export const prManageTool: MCPTool<PRManageInput, PRManageResult> = {
  name: 'github_pr_manage',
  description: 'List, create, review, merge, or close pull requests on a GitHub repository.',
  category: 'github',
  mutating: true,
  inputSchema: PRManageInputSchema,
  handler: async (input, { client }) => {
    try {
      const { owner, repo } = client.resolveRepo(input);

      switch (input.action) {
        case 'list':
          return { success: true, data: await listPullRequests(client, owner, repo, input) };
        case 'create':
          client.requireAuth('create a pull request');
          return { success: true, data: await createPullRequest(client, owner, repo, input) };
        case 'review':
          client.requireAuth('review a pull request');
          return { success: true, data: await reviewPullRequest(client, owner, repo, input) };
        case 'merge':
          client.requireAuth('merge a pull request');
          return { success: true, data: await mergePullRequest(client, owner, repo, input) };
        case 'close':
          client.requireAuth('close a pull request');
          return { success: true, data: await closePullRequest(client, owner, repo, input) };
      }
    } catch (error) {
      return toToolError(error);
    }
  },
};

function toSummary(pr: {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  user?: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at?: string | null;
}): PRSummary {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: pr.draft ?? false,
    author: pr.user?.login ?? null,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at ?? null,
  };
}

async function listPullRequests(client: ToolContext['client'], owner: string, repo: string, input: PRManageInput): Promise<PRManageResult> {
  const prs = await client.execute('listing pull requests', () =>
    client.octokit.rest.pulls.list({ owner, repo, state: input.state ?? 'open', per_page: 50 }).then((r) => r.data),
  );
  const pullRequests = prs.map(toSummary);
  return {
    action: 'list',
    pullRequests,
    total: pullRequests.length,
    open: pullRequests.filter((pr) => pr.state === 'open').length,
  };
}

async function createPullRequest(client: ToolContext['client'], owner: string, repo: string, input: PRManageInput): Promise<PRManageResult> {
  const base = input.baseBranch ?? (await client.execute<string>('fetching default branch', () => client.octokit.rest.repos.get({ owner, repo }).then((r) => r.data.default_branch)));

  const pr = await client.execute('creating pull request', () =>
    client.octokit.rest.pulls
      .create({ owner, repo, title: input.title!, head: input.branch!, base, body: input.body, draft: input.draft })
      .then((r) => r.data),
  );

  return { action: 'created', pullRequest: toSummary(pr) };
}

async function reviewPullRequest(client: ToolContext['client'], owner: string, repo: string, input: PRManageInput): Promise<PRManageResult> {
  const review = await client.execute('submitting pull request review', () =>
    client.octokit.rest.pulls
      .createReview({ owner, repo, pull_number: input.prNumber!, event: input.reviewEvent ?? 'COMMENT', body: input.body ?? 'Automated review via @claude-flow/plugin-github-bridge' })
      .then((r) => r.data),
  );

  return {
    action: 'reviewed',
    prNumber: input.prNumber!,
    review: { id: review.id, state: review.state, submittedAt: review.submitted_at ?? null },
  };
}

async function mergePullRequest(client: ToolContext['client'], owner: string, repo: string, input: PRManageInput): Promise<PRManageResult> {
  const result = await client.execute('merging pull request', () =>
    client.octokit.rest.pulls.merge({ owner, repo, pull_number: input.prNumber!, merge_method: input.mergeMethod }).then((r) => r.data),
  );

  return { action: 'merged', prNumber: input.prNumber!, merged: result.merged, message: result.message, sha: result.sha };
}

async function closePullRequest(client: ToolContext['client'], owner: string, repo: string, input: PRManageInput): Promise<PRManageResult> {
  const pr = await client.execute('closing pull request', () =>
    client.octokit.rest.pulls.update({ owner, repo, pull_number: input.prNumber!, state: 'closed' }).then((r) => r.data),
  );

  return { action: 'closed', prNumber: input.prNumber!, closedAt: pr.closed_at ?? null };
}
