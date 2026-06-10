/**
 * github_pr_manage tool
 *
 * Online (token + owner/repo present): real Octokit-backed pull request
 * list/create/review/merge/close. Offline: local JSON store, preserved for
 * workflow coordination without network access.
 */

import type { Octokit } from '@octokit/rest';
import type { MCPTool } from '../types.js';
import type { PullRequestSummary } from './types.js';
import { loadGitHubStore, saveGitHubStore } from './store.js';
import { resolveGitHubContext, formatGitHubError } from './client.js';

interface OctokitPullRequestLike {
  number: number;
  title: string;
  state: string;
  draft?: boolean | null;
  user: { login: string } | null;
  head: { ref: string };
  base: { ref: string };
  html_url: string;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
}

function toSummary(pr: OctokitPullRequestLike): PullRequestSummary {
  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    draft: Boolean(pr.draft),
    author: pr.user?.login ?? null,
    headRef: pr.head.ref,
    baseRef: pr.base.ref,
    url: pr.html_url,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    mergedAt: pr.merged_at,
  };
}

function offlinePRManage(input: Record<string, unknown>) {
  const store = loadGitHubStore();
  const action = (input.action as string) || 'list';
  const owner = (input.owner as string) || 'owner';
  const repo = (input.repo as string) || 'repo';

  if (action === 'list') {
    const prs = Object.values(store.prs);
    return {
      success: true,
      pullRequests: prs,
      total: prs.length,
      open: prs.filter((pr) => pr.status === 'open').length,
    };
  }

  if (action === 'create') {
    const prId = `pr-${Date.now()}`;
    const pr = {
      id: prId,
      title: (input.title as string) || 'New PR',
      status: 'open',
      branch: (input.branch as string) || 'feature',
      baseBranch: (input.baseBranch as string) || 'main',
      createdAt: new Date().toISOString(),
    };
    store.prs[prId] = pr;
    saveGitHubStore(store);

    return {
      success: true,
      action: 'created',
      pullRequest: pr,
      url: `https://github.com/${owner}/${repo}/pull/${prId}`,
    };
  }

  if (action === 'review') {
    return {
      success: true,
      action: 'reviewed',
      prNumber: input.prNumber,
      review: {
        status: 'approved',
        comments: [],
        suggestion: 'LGTM',
      },
    };
  }

  if (action === 'merge') {
    const prNumber = input.prNumber as number;
    const prKey = Object.keys(store.prs).find((k) => k.includes(String(prNumber)));
    if (prKey && store.prs[prKey]) {
      store.prs[prKey].status = 'merged';
      saveGitHubStore(store);
    }

    return {
      success: true,
      action: 'merged',
      prNumber,
      mergedAt: new Date().toISOString(),
    };
  }

  if (action === 'close') {
    const prNumber = input.prNumber as number;
    const prKey = Object.keys(store.prs).find((k) => k.includes(String(prNumber)));
    if (prKey && store.prs[prKey]) {
      store.prs[prKey].status = 'closed';
      saveGitHubStore(store);
    }

    return {
      success: true,
      action: 'closed',
      prNumber,
      closedAt: new Date().toISOString(),
    };
  }

  return { success: false, error: 'Unknown action' };
}

async function onlinePRManage(octokit: Octokit, owner: string, repo: string, input: Record<string, unknown>) {
  const action = (input.action as string) || 'list';

  try {
    if (action === 'list') {
      const state = (input.state as 'open' | 'closed' | 'all') || 'open';
      const { data } = await octokit.pulls.list({ owner, repo, state, per_page: 100 });
      const pullRequests = data.map((pr) => toSummary(pr));
      return {
        success: true,
        pullRequests,
        total: pullRequests.length,
        open: pullRequests.filter((pr) => pr.state === 'open').length,
      };
    }

    if (action === 'create') {
      const title = input.title as string | undefined;
      const branch = input.branch as string | undefined;
      if (!title || !branch) {
        return { success: false, error: 'title and branch are required for create action' };
      }
      const { data } = await octokit.pulls.create({
        owner,
        repo,
        title,
        head: branch,
        base: (input.baseBranch as string) || 'main',
        body: input.body as string | undefined,
        draft: input.draft as boolean | undefined,
      });
      return { success: true, action: 'created', pullRequest: toSummary(data), url: data.html_url };
    }

    if (action === 'review') {
      const prNumber = input.prNumber as number | undefined;
      if (!prNumber) {
        return { success: false, error: 'prNumber is required for review action' };
      }
      const event = (input.reviewEvent as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT') || 'COMMENT';
      const { data } = await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event,
        body: input.body as string | undefined,
      });
      return {
        success: true,
        action: 'reviewed',
        prNumber,
        review: { id: data.id, state: data.state, body: data.body ?? '' },
      };
    }

    if (action === 'merge') {
      const prNumber = input.prNumber as number | undefined;
      if (!prNumber) {
        return { success: false, error: 'prNumber is required for merge action' };
      }
      const { data } = await octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: input.mergeMethod as 'merge' | 'squash' | 'rebase' | undefined,
      });
      return {
        success: true,
        action: 'merged',
        prNumber,
        merged: data.merged,
        message: data.message,
        sha: data.sha,
        mergedAt: new Date().toISOString(),
      };
    }

    if (action === 'close') {
      const prNumber = input.prNumber as number | undefined;
      if (!prNumber) {
        return { success: false, error: 'prNumber is required for close action' };
      }
      await octokit.pulls.update({ owner, repo, pull_number: prNumber, state: 'closed' });
      return { success: true, action: 'closed', prNumber, closedAt: new Date().toISOString() };
    }

    return { success: false, error: 'Unknown action' };
  } catch (error) {
    return formatGitHubError(error);
  }
}

export const prManageTool: MCPTool = {
  name: 'github_pr_manage',
  description: 'Manage pull requests',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['list', 'create', 'review', 'merge', 'close'], description: 'Action to perform' },
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'PR state filter for list' },
      prNumber: { type: 'number', description: 'PR number' },
      title: { type: 'string', description: 'PR title' },
      branch: { type: 'string', description: 'Source branch' },
      baseBranch: { type: 'string', description: 'Target branch' },
      body: { type: 'string', description: 'PR description' },
      draft: { type: 'boolean', description: 'Create as a draft PR' },
      reviewEvent: { type: 'string', enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'], description: 'Review event type' },
      mergeMethod: { type: 'string', enum: ['merge', 'squash', 'rebase'], description: 'Merge method' },
    },
  },
  handler: async (input) => {
    const ctx = resolveGitHubContext(input);
    if (!ctx) {
      return offlinePRManage(input);
    }
    return onlinePRManage(ctx.octokit, ctx.owner, ctx.repo, input);
  },
};
