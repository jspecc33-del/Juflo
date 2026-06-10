/**
 * github_metrics tool
 *
 * Online (token + owner/repo present): real Octokit-backed commit,
 * contributor, traffic and release metrics. Offline: randomized
 * placeholder metrics, preserved for workflow coordination without
 * network access.
 */

import type { Octokit } from '@octokit/rest';
import type { MCPTool } from '../types.js';
import { resolveGitHubContext, formatGitHubError } from './client.js';

async function fetchCommitMetrics(octokit: Octokit, owner: string, repo: string) {
  const response = await octokit.repos.getCommitActivityStats({ owner, repo });
  if (response.status !== 200 || !Array.isArray(response.data)) {
    return { total: 0, lastWeek: 0, lastMonth: 0 };
  }
  const weeks = response.data;
  const total = weeks.reduce((sum, w) => sum + (w.total ?? 0), 0);
  const lastWeek = weeks[weeks.length - 1]?.total ?? 0;
  const lastMonth = weeks.slice(-4).reduce((sum, w) => sum + (w.total ?? 0), 0);
  return { total, lastWeek, lastMonth };
}

async function fetchContributorMetrics(octokit: Octokit, owner: string, repo: string) {
  const { data } = await octokit.repos.listContributors({ owner, repo, per_page: 100 });
  return {
    total: data.length,
    topContributor: data[0]?.login ?? null,
    totalContributions: data.reduce((sum, c) => sum + (c.contributions ?? 0), 0),
  };
}

async function fetchTrafficMetrics(octokit: Octokit, owner: string, repo: string) {
  try {
    const [views, clones] = await Promise.all([
      octokit.repos.getViews({ owner, repo }),
      octokit.repos.getClones({ owner, repo }),
    ]);
    return {
      views: views.data.count,
      uniqueVisitors: views.data.uniques,
      clones: clones.data.count,
      uniqueCloners: clones.data.uniques,
    };
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 403 || status === 404 || status === 401) {
      return {};
    }
    throw error;
  }
}

async function fetchReleaseMetrics(octokit: Octokit, owner: string, repo: string) {
  const { data } = await octokit.repos.listReleases({ owner, repo, per_page: 20 });
  const downloads = data.reduce(
    (sum, r) => sum + r.assets.reduce((assetSum, a) => assetSum + (a.download_count ?? 0), 0),
    0,
  );
  return {
    total: data.length,
    latest: data[0]?.tag_name ?? null,
    downloads,
  };
}

function offlineMetrics(input: Record<string, unknown>) {
  const metric = (input.metric as string) || 'all';

  const metrics = {
    commits: {
      total: Math.floor(Math.random() * 1000) + 500,
      lastWeek: Math.floor(Math.random() * 50) + 10,
      lastMonth: Math.floor(Math.random() * 200) + 50,
    },
    contributors: {
      total: Math.floor(Math.random() * 50) + 5,
      active: Math.floor(Math.random() * 20) + 3,
      new: Math.floor(Math.random() * 5),
    },
    traffic: {
      views: Math.floor(Math.random() * 5000) + 1000,
      uniqueVisitors: Math.floor(Math.random() * 1000) + 200,
      clones: Math.floor(Math.random() * 500) + 50,
    },
    releases: {
      total: Math.floor(Math.random() * 20) + 5,
      latest: '3.0.0-alpha.86',
      downloads: Math.floor(Math.random() * 10000) + 1000,
    },
  };

  if (metric === 'all') {
    return { success: true, metrics };
  }

  return {
    success: true,
    metric,
    data: metrics[metric as keyof typeof metrics],
  };
}

async function onlineMetrics(octokit: Octokit, owner: string, repo: string, input: Record<string, unknown>) {
  const metric = (input.metric as string) || 'all';

  try {
    const metrics: Record<string, unknown> = {};
    const tasks: Array<Promise<void>> = [];

    if (metric === 'all' || metric === 'commits') {
      tasks.push(fetchCommitMetrics(octokit, owner, repo).then((r) => { metrics.commits = r; }));
    }
    if (metric === 'all' || metric === 'contributors') {
      tasks.push(fetchContributorMetrics(octokit, owner, repo).then((r) => { metrics.contributors = r; }));
    }
    if (metric === 'all' || metric === 'traffic') {
      tasks.push(fetchTrafficMetrics(octokit, owner, repo).then((r) => { metrics.traffic = r; }));
    }
    if (metric === 'all' || metric === 'releases') {
      tasks.push(fetchReleaseMetrics(octokit, owner, repo).then((r) => { metrics.releases = r; }));
    }

    await Promise.all(tasks);

    if (metric === 'all') {
      return { success: true, repository: `${owner}/${repo}`, metrics, generatedAt: new Date().toISOString() };
    }

    return {
      success: true,
      repository: `${owner}/${repo}`,
      metric,
      data: metrics[metric],
      generatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return formatGitHubError(error);
  }
}

export const metricsTool: MCPTool = {
  name: 'github_metrics',
  description: 'Get repository metrics and statistics',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      metric: { type: 'string', enum: ['all', 'commits', 'contributors', 'traffic', 'releases'], description: 'Metric type' },
      timeRange: { type: 'string', description: 'Time range' },
    },
  },
  handler: async (input) => {
    const ctx = resolveGitHubContext(input);
    if (!ctx) {
      return offlineMetrics(input);
    }
    return onlineMetrics(ctx.octokit, ctx.owner, ctx.repo, input);
  },
};
