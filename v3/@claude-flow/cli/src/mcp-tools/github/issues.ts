/**
 * github_issue_track tool
 *
 * Online (token + owner/repo present): real Octokit-backed issue
 * list/create/update/close/assign. Offline: local JSON store, preserved for
 * workflow coordination without network access.
 */

import type { Octokit } from '@octokit/rest';
import type { MCPTool } from '../types.js';
import type { IssueSummary } from './types.js';
import { loadGitHubStore, saveGitHubStore } from './store.js';
import { resolveGitHubContext, formatGitHubError } from './client.js';

interface OctokitIssueLike {
  number: number;
  title: string;
  state: string;
  labels: Array<string | { name?: string }>;
  assignees?: Array<{ login: string }> | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
}

function toSummary(issue: OctokitIssueLike): IssueSummary {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    labels: issue.labels.map((l) => (typeof l === 'string' ? l : (l.name ?? ''))).filter(Boolean),
    assignees: (issue.assignees ?? []).map((a) => a.login),
    url: issue.html_url,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
    closedAt: issue.closed_at,
  };
}

function offlineIssueTrack(input: Record<string, unknown>) {
  const store = loadGitHubStore();
  const action = (input.action as string) || 'list';

  if (action === 'list') {
    const issues = Object.values(store.issues);
    return {
      success: true,
      issues,
      total: issues.length,
      open: issues.filter((i) => i.status === 'open').length,
    };
  }

  if (action === 'create') {
    const issueId = `issue-${Date.now()}`;
    const issue = {
      id: issueId,
      title: (input.title as string) || 'New Issue',
      status: 'open',
      labels: (input.labels as string[]) || [],
      createdAt: new Date().toISOString(),
    };
    store.issues[issueId] = issue;
    saveGitHubStore(store);

    return {
      success: true,
      action: 'created',
      issue,
    };
  }

  if (action === 'update') {
    const issueNumber = input.issueNumber as number;
    const issueKey = Object.keys(store.issues).find((k) => k.includes(String(issueNumber)));
    if (issueKey && store.issues[issueKey]) {
      if (input.title) store.issues[issueKey].title = input.title as string;
      if (input.labels) store.issues[issueKey].labels = input.labels as string[];
      saveGitHubStore(store);
    }

    return {
      success: true,
      action: 'updated',
      issueNumber,
    };
  }

  if (action === 'close') {
    const issueNumber = input.issueNumber as number;
    const issueKey = Object.keys(store.issues).find((k) => k.includes(String(issueNumber)));
    if (issueKey && store.issues[issueKey]) {
      store.issues[issueKey].status = 'closed';
      saveGitHubStore(store);
    }

    return {
      success: true,
      action: 'closed',
      issueNumber,
      closedAt: new Date().toISOString(),
    };
  }

  return { success: false, error: 'Unknown action' };
}

async function onlineIssueTrack(octokit: Octokit, owner: string, repo: string, input: Record<string, unknown>) {
  const action = (input.action as string) || 'list';

  try {
    if (action === 'list') {
      const state = (input.state as 'open' | 'closed' | 'all') || 'open';
      const labels = (input.labels as string[] | undefined)?.join(',');
      const { data } = await octokit.issues.listForRepo({ owner, repo, state, labels, per_page: 100 });
      const issues = data.filter((issue) => !('pull_request' in issue && issue.pull_request)).map((issue) => toSummary(issue));
      return {
        success: true,
        issues,
        total: issues.length,
        open: issues.filter((i) => i.state === 'open').length,
      };
    }

    if (action === 'create') {
      const title = input.title as string | undefined;
      if (!title) {
        return { success: false, error: 'title is required for create action' };
      }
      const { data } = await octokit.issues.create({
        owner,
        repo,
        title,
        body: input.body as string | undefined,
        labels: input.labels as string[] | undefined,
        assignees: input.assignees as string[] | undefined,
      });
      return { success: true, action: 'created', issue: toSummary(data) };
    }

    if (action === 'update') {
      const issueNumber = input.issueNumber as number | undefined;
      if (!issueNumber) {
        return { success: false, error: 'issueNumber is required for update action' };
      }
      await octokit.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        title: input.title as string | undefined,
        body: input.body as string | undefined,
        labels: input.labels as string[] | undefined,
      });
      return { success: true, action: 'updated', issueNumber };
    }

    if (action === 'close') {
      const issueNumber = input.issueNumber as number | undefined;
      if (!issueNumber) {
        return { success: false, error: 'issueNumber is required for close action' };
      }
      await octokit.issues.update({ owner, repo, issue_number: issueNumber, state: 'closed' });
      return { success: true, action: 'closed', issueNumber, closedAt: new Date().toISOString() };
    }

    if (action === 'assign') {
      const issueNumber = input.issueNumber as number | undefined;
      const assignees = input.assignees as string[] | undefined;
      if (!issueNumber || !assignees?.length) {
        return { success: false, error: 'issueNumber and assignees are required for assign action' };
      }
      const { data } = await octokit.issues.addAssignees({ owner, repo, issue_number: issueNumber, assignees });
      return {
        success: true,
        action: 'assigned',
        issueNumber,
        assignees: data.assignees?.map((a) => a.login) ?? assignees,
      };
    }

    return { success: false, error: 'Unknown action' };
  } catch (error) {
    return formatGitHubError(error);
  }
}

export const issueTrackTool: MCPTool = {
  name: 'github_issue_track',
  description: 'Track and manage issues',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'update', 'close', 'assign'], description: 'Action to perform' },
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state filter for list' },
      issueNumber: { type: 'number', description: 'Issue number' },
      title: { type: 'string', description: 'Issue title' },
      body: { type: 'string', description: 'Issue body' },
      labels: { type: 'array', items: { type: 'string' }, description: 'Issue labels' },
      assignees: { type: 'array', items: { type: 'string' }, description: 'Assignees' },
    },
  },
  handler: async (input) => {
    const ctx = resolveGitHubContext(input);
    if (!ctx) {
      return offlineIssueTrack(input);
    }
    return onlineIssueTrack(ctx.octokit, ctx.owner, ctx.repo, input);
  },
};
