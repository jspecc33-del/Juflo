/**
 * GitHub Bridge Plugin - Repository Analysis Tool
 *
 * `github_repo_analyze`: fetches live repository metadata, languages,
 * branch/contributor counts, and open issue/PR counts via the GitHub
 * REST and Search APIs.
 *
 * @module github-bridge/tools/repo
 */

import type { MCPTool, ToolContext } from '../types.js';
import { RepoAnalyzeInputSchema, type RepoAnalyzeInput } from '../validators.js';
import { toToolError } from '../errors.js';

export interface RepoAnalysis {
  repository: string;
  branch: string;
  metrics: {
    branches: number;
    contributors: number;
    openIssues: number;
    openPRs: number;
    commitsLastYear?: number;
  };
  analysis: {
    languages: string[];
    mainLanguage: string | null;
    defaultBranch: string;
    visibility: string;
    stars: number;
    forks: number;
    license: string | null;
    description: string | null;
  };
  lastAnalyzed: string;
}

export const repoAnalyzeTool: MCPTool<RepoAnalyzeInput, RepoAnalysis> = {
  name: 'github_repo_analyze',
  description: 'Analyze a GitHub repository: metadata, languages, branches, contributors, and open issue/PR counts.',
  category: 'github',
  mutating: false,
  inputSchema: RepoAnalyzeInputSchema,
  handler: async (input, { client }) => {
    try {
      const { owner, repo } = client.resolveRepo(input);

      const [repoData, branches, contributors, languages, issueCounts] = await Promise.all([
        client.execute('fetching repository', () => client.octokit.rest.repos.get({ owner, repo }).then((r) => r.data)),
        client.execute('listing branches', () => client.octokit.rest.repos.listBranches({ owner, repo, per_page: 100 }).then((r) => r.data)),
        client.execute('listing contributors', () => client.octokit.rest.repos.listContributors({ owner, repo, per_page: 100 }).then((r) => r.data)),
        client.execute('listing languages', () => client.octokit.rest.repos.listLanguages({ owner, repo }).then((r) => r.data)),
        fetchIssuePRCounts(client, owner, repo),
      ]);

      const commitsLastYear = input.deep ? await fetchCommitActivity(client, owner, repo) : undefined;

      const analysis: RepoAnalysis = {
        repository: `${owner}/${repo}`,
        branch: input.branch ?? repoData.default_branch,
        metrics: {
          branches: branches.length,
          contributors: contributors.length,
          openIssues: issueCounts.issues,
          openPRs: issueCounts.prs,
          ...(commitsLastYear !== undefined ? { commitsLastYear } : {}),
        },
        analysis: {
          languages: Object.keys(languages),
          mainLanguage: repoData.language,
          defaultBranch: repoData.default_branch,
          visibility: repoData.visibility ?? (repoData.private ? 'private' : 'public'),
          stars: repoData.stargazers_count,
          forks: repoData.forks_count,
          license: repoData.license?.spdx_id ?? null,
          description: repoData.description,
        },
        lastAnalyzed: new Date().toISOString(),
      };

      return { success: true, data: analysis };
    } catch (error) {
      return toToolError(error);
    }
  },
};

async function fetchIssuePRCounts(client: ToolContext['client'], owner: string, repo: string): Promise<{ issues: number; prs: number }> {
  const [issues, prs] = await Promise.all([
    client.execute('searching open issues', () =>
      client.octokit.rest.search.issuesAndPullRequests({ q: `repo:${owner}/${repo} is:issue is:open`, per_page: 1 }).then((r) => r.data.total_count),
    ),
    client.execute('searching open pull requests', () =>
      client.octokit.rest.search.issuesAndPullRequests({ q: `repo:${owner}/${repo} is:pr is:open`, per_page: 1 }).then((r) => r.data.total_count),
    ),
  ]);
  return { issues, prs };
}

/**
 * GitHub computes commit-activity stats asynchronously; a 202 response means
 * the stats are still being generated, in which case we report `undefined`
 * rather than a misleading zero.
 */
async function fetchCommitActivity(client: ToolContext['client'], owner: string, repo: string): Promise<number | undefined> {
  const response = await client.execute('fetching commit activity', () => client.octokit.rest.repos.getCommitActivityStats({ owner, repo }));
  const data: unknown = response.data;
  if (response.status === 202 || !Array.isArray(data)) {
    return undefined;
  }
  return (data as Array<{ total: number }>).reduce((sum, week) => sum + week.total, 0);
}
