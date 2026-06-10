/**
 * GitHub Bridge Plugin - Issue Tracking Tool
 *
 * `github_issue_track`: list, create, update, close, and assign issues via
 * the GitHub REST API.
 *
 * @module github-bridge/tools/issues
 */

import type { MCPTool, ToolContext } from '../types.js';
import { IssueTrackInputSchema, type IssueTrackInput } from '../validators.js';
import { toToolError } from '../errors.js';

export interface IssueSummary {
  number: number;
  title: string;
  state: string;
  labels: string[];
  assignees: string[];
  url: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export type IssueTrackResult =
  | { action: 'list'; issues: IssueSummary[]; total: number; open: number }
  | { action: 'created'; issue: IssueSummary }
  | { action: 'updated'; issue: IssueSummary }
  | { action: 'closed'; issueNumber: number; closedAt: string | null }
  | { action: 'assigned'; issue: IssueSummary };

export const issueTrackTool: MCPTool<IssueTrackInput, IssueTrackResult> = {
  name: 'github_issue_track',
  description: 'List, create, update, close, or assign issues on a GitHub repository.',
  category: 'github',
  mutating: true,
  inputSchema: IssueTrackInputSchema,
  handler: async (input, { client }) => {
    try {
      const { owner, repo } = client.resolveRepo(input);

      switch (input.action) {
        case 'list':
          return { success: true, data: await listIssues(client, owner, repo, input) };
        case 'create':
          client.requireAuth('create an issue');
          return { success: true, data: await createIssue(client, owner, repo, input) };
        case 'update':
          client.requireAuth('update an issue');
          return { success: true, data: await updateIssue(client, owner, repo, input) };
        case 'close':
          client.requireAuth('close an issue');
          return { success: true, data: await closeIssue(client, owner, repo, input) };
        case 'assign':
          client.requireAuth('assign an issue');
          return { success: true, data: await assignIssue(client, owner, repo, input) };
      }
    } catch (error) {
      return toToolError(error);
    }
  },
};

function toSummary(issue: {
  number: number;
  title: string;
  state: string;
  labels: Array<string | { name?: string }>;
  assignees?: Array<{ login: string }> | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
}): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map((label) => (typeof label === 'string' ? label : (label.name ?? ''))).filter(Boolean),
    assignees: (issue.assignees ?? []).map((a) => a.login),
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at ?? null,
  };
}

async function listIssues(client: ToolContext['client'], owner: string, repo: string, input: IssueTrackInput): Promise<IssueTrackResult> {
  const rawIssues = await client.execute('listing issues', () =>
    client.octokit.rest.issues.listForRepo({ owner, repo, state: input.state ?? 'open', per_page: 50 }).then((r) => r.data),
  );

  // listForRepo also returns pull requests; exclude them so callers get true issues.
  const issues = rawIssues.filter((issue) => !('pull_request' in issue && issue.pull_request)).map(toSummary);

  return {
    action: 'list',
    issues,
    total: issues.length,
    open: issues.filter((issue) => issue.state === 'open').length,
  };
}

async function createIssue(client: ToolContext['client'], owner: string, repo: string, input: IssueTrackInput): Promise<IssueTrackResult> {
  const issue = await client.execute('creating issue', () =>
    client.octokit.rest.issues
      .create({ owner, repo, title: input.title!, body: input.body, labels: input.labels, assignees: input.assignees })
      .then((r) => r.data),
  );

  return { action: 'created', issue: toSummary(issue) };
}

async function updateIssue(client: ToolContext['client'], owner: string, repo: string, input: IssueTrackInput): Promise<IssueTrackResult> {
  const issue = await client.execute('updating issue', () =>
    client.octokit.rest.issues
      .update({ owner, repo, issue_number: input.issueNumber!, title: input.title, body: input.body, labels: input.labels })
      .then((r) => r.data),
  );

  return { action: 'updated', issue: toSummary(issue) };
}

async function closeIssue(client: ToolContext['client'], owner: string, repo: string, input: IssueTrackInput): Promise<IssueTrackResult> {
  const issue = await client.execute('closing issue', () =>
    client.octokit.rest.issues.update({ owner, repo, issue_number: input.issueNumber!, state: 'closed' }).then((r) => r.data),
  );

  return { action: 'closed', issueNumber: input.issueNumber!, closedAt: issue.closed_at ?? null };
}

async function assignIssue(client: ToolContext['client'], owner: string, repo: string, input: IssueTrackInput): Promise<IssueTrackResult> {
  const issue = await client.execute('assigning issue', () =>
    client.octokit.rest.issues.addAssignees({ owner, repo, issue_number: input.issueNumber!, assignees: input.assignees! }).then((r) => r.data),
  );

  return { action: 'assigned', issue: toSummary(issue) };
}
