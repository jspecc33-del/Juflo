/**
 * GitHub Bridge Plugin - Repository Metrics Tool
 *
 * `github_metrics`: fetches commit activity, contributor stats, traffic
 * (views/clones), and release history for a repository.
 *
 * @module github-bridge/tools/metrics
 */

import type { MCPTool, ToolContext } from '../types.js';
import { MetricsInputSchema, type MetricsInput } from '../validators.js';
import { GitHubBridgeError, GitHubErrorCode, toToolError } from '../errors.js';

export interface CommitActivity {
  totalCommitsLastYear?: number;
  weeks?: Array<{ week: number; total: number; days: number[] }>;
}

export interface ContributorStat {
  login: string;
  contributions: number;
  url: string;
}

export interface TrafficStats {
  views?: { count: number; uniques: number };
  clones?: { count: number; uniques: number };
}

export interface ReleaseSummary {
  id: number;
  tagName: string;
  name: string | null;
  draft: boolean;
  prerelease: boolean;
  publishedAt: string | null;
  url: string;
}

export interface MetricsResult {
  repository: string;
  metric: string;
  commits?: CommitActivity;
  contributors?: ContributorStat[];
  traffic?: TrafficStats;
  releases?: ReleaseSummary[];
  generatedAt: string;
}

export const metricsTool: MCPTool<MetricsInput, MetricsResult> = {
  name: 'github_metrics',
  description: 'Fetch repository metrics: commit activity, contributors, traffic, and releases.',
  category: 'github',
  mutating: false,
  inputSchema: MetricsInputSchema,
  handler: async (input, { client }) => {
    try {
      const { owner, repo } = client.resolveRepo(input);
      const metric = input.metric ?? 'all';

      const result: MetricsResult = {
        repository: `${owner}/${repo}`,
        metric,
        generatedAt: new Date().toISOString(),
      };

      const tasks: Array<Promise<void>> = [];

      if (metric === 'all' || metric === 'commits') {
        tasks.push(fetchCommitActivity(client, owner, repo).then((commits) => { result.commits = commits; }));
      }
      if (metric === 'all' || metric === 'contributors') {
        tasks.push(fetchContributors(client, owner, repo).then((contributors) => { result.contributors = contributors; }));
      }
      if (metric === 'all' || metric === 'traffic') {
        tasks.push(fetchTraffic(client, owner, repo).then((traffic) => { result.traffic = traffic; }));
      }
      if (metric === 'all' || metric === 'releases') {
        tasks.push(fetchReleases(client, owner, repo).then((releases) => { result.releases = releases; }));
      }

      await Promise.all(tasks);

      return { success: true, data: result };
    } catch (error) {
      return toToolError(error);
    }
  },
};

/**
 * GitHub computes commit-activity stats asynchronously; a 202 response means
 * the stats are still being generated, in which case we report an empty
 * result rather than a misleading zero.
 */
async function fetchCommitActivity(client: ToolContext['client'], owner: string, repo: string): Promise<CommitActivity> {
  const response = await client.execute('fetching commit activity', () => client.octokit.rest.repos.getCommitActivityStats({ owner, repo }));
  const data: unknown = response.data;
  if (response.status === 202 || !Array.isArray(data)) {
    return {};
  }

  const weeks = data as Array<{ week: number; total: number; days: number[] }>;
  return {
    totalCommitsLastYear: weeks.reduce((sum, week) => sum + week.total, 0),
    weeks,
  };
}

async function fetchContributors(client: ToolContext['client'], owner: string, repo: string): Promise<ContributorStat[]> {
  const contributors = await client.execute('listing contributors', () =>
    client.octokit.rest.repos.listContributors({ owner, repo, per_page: 100 }).then((r) => r.data),
  );

  return contributors
    .filter((c): c is typeof c & { login: string; contributions: number } => Boolean(c.login))
    .map((c) => ({ login: c.login, contributions: c.contributions, url: c.html_url ?? '' }));
}

/**
 * Traffic stats (views/clones) require push access to the repository; for
 * repos the caller can only read, GitHub returns 403/404 which we treat as
 * "no traffic data available" rather than a hard failure.
 */
async function fetchTraffic(client: ToolContext['client'], owner: string, repo: string): Promise<TrafficStats> {
  try {
    const [views, clones] = await Promise.all([
      client.execute('fetching traffic views', () => client.octokit.rest.repos.getViews({ owner, repo })),
      client.execute('fetching traffic clones', () => client.octokit.rest.repos.getClones({ owner, repo })),
    ]);

    return {
      views: { count: views.data.count, uniques: views.data.uniques },
      clones: { count: clones.data.count, uniques: clones.data.uniques },
    };
  } catch (error) {
    if (
      error instanceof GitHubBridgeError &&
      (error.code === GitHubErrorCode.FORBIDDEN || error.code === GitHubErrorCode.UNAUTHORIZED || error.code === GitHubErrorCode.NOT_FOUND)
    ) {
      return {};
    }
    throw error;
  }
}

async function fetchReleases(client: ToolContext['client'], owner: string, repo: string): Promise<ReleaseSummary[]> {
  const releases = await client.execute('listing releases', () =>
    client.octokit.rest.repos.listReleases({ owner, repo, per_page: 10 }).then((r) => r.data),
  );

  return releases.map((r) => ({
    id: r.id,
    tagName: r.tag_name,
    name: r.name,
    draft: r.draft,
    prerelease: r.prerelease,
    publishedAt: r.published_at,
    url: r.html_url,
  }));
}
