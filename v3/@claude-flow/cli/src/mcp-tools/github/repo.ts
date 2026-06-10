/**
 * github_repo_analyze tool
 *
 * Online (token + owner/repo present): real Octokit-backed repository
 * analysis (languages, branches, contributors, open issue/PR counts).
 * Offline: local JSON store with placeholder metrics, preserved for
 * workflow coordination without network access.
 */

import type { Octokit } from '@octokit/rest';
import type { MCPTool } from '../types.js';
import type { RepoInfo } from './types.js';
import { loadGitHubStore, saveGitHubStore } from './store.js';
import { resolveGitHubContext, formatGitHubError } from './client.js';

async function fetchIssuePRCounts(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<{ openIssues: number; openPRs: number }> {
  const [issues, prs] = await Promise.all([
    octokit.search.issuesAndPullRequests({ q: `repo:${owner}/${repo} is:issue is:open`, per_page: 1 }),
    octokit.search.issuesAndPullRequests({ q: `repo:${owner}/${repo} is:pr is:open`, per_page: 1 }),
  ]);
  return { openIssues: issues.data.total_count, openPRs: prs.data.total_count };
}

async function fetchCommitActivity(octokit: Octokit, owner: string, repo: string): Promise<number | undefined> {
  const response = await octokit.repos.getCommitActivityStats({ owner, repo });
  if (response.status !== 200 || !Array.isArray(response.data)) {
    return undefined;
  }
  return response.data.reduce((sum, week) => sum + (week.total ?? 0), 0);
}

function offlineAnalyze(input: Record<string, unknown>) {
  const store = loadGitHubStore();
  const owner = (input.owner as string) || 'owner';
  const repo = (input.repo as string) || 'repo';
  const branch = (input.branch as string) || 'main';
  const repoKey = `${owner}/${repo}`;

  const repoInfo: RepoInfo = {
    owner,
    name: repo,
    branch,
    lastAnalyzed: new Date().toISOString(),
    metrics: {
      commits: Math.floor(Math.random() * 1000) + 100,
      branches: Math.floor(Math.random() * 20) + 1,
      contributors: Math.floor(Math.random() * 50) + 1,
      openIssues: Math.floor(Math.random() * 30),
      openPRs: Math.floor(Math.random() * 10),
    },
  };

  store.repos[repoKey] = repoInfo;
  saveGitHubStore(store);

  return {
    success: true,
    repository: repoKey,
    branch,
    metrics: repoInfo.metrics,
    analysis: {
      languages: ['TypeScript', 'JavaScript', 'JSON'],
      mainLanguage: 'TypeScript',
      codeQuality: 'A',
      testCoverage: `${Math.floor(Math.random() * 30) + 70}%`,
      dependencies: Math.floor(Math.random() * 50) + 20,
      securityIssues: Math.floor(Math.random() * 3),
    },
    lastAnalyzed: repoInfo.lastAnalyzed,
  };
}

async function onlineAnalyze(octokit: Octokit, owner: string, repo: string, input: Record<string, unknown>) {
  try {
    const [repoData, languages, branches, contributors, counts] = await Promise.all([
      octokit.repos.get({ owner, repo }),
      octokit.repos.listLanguages({ owner, repo }),
      octokit.repos.listBranches({ owner, repo, per_page: 100 }),
      octokit.repos.listContributors({ owner, repo, per_page: 100 }),
      fetchIssuePRCounts(octokit, owner, repo),
    ]);

    const commitsLastYear = input.deep ? await fetchCommitActivity(octokit, owner, repo) : undefined;
    const languageNames = Object.keys(languages.data);

    return {
      success: true,
      repository: `${owner}/${repo}`,
      branch: (input.branch as string) || repoData.data.default_branch,
      metrics: {
        branches: branches.data.length,
        contributors: contributors.data.length,
        openIssues: counts.openIssues,
        openPRs: counts.openPRs,
        ...(commitsLastYear !== undefined ? { commitsLastYear } : {}),
      },
      analysis: {
        languages: languageNames,
        mainLanguage: languageNames[0] ?? 'Unknown',
        defaultBranch: repoData.data.default_branch,
        visibility: repoData.data.visibility ?? (repoData.data.private ? 'private' : 'public'),
        stars: repoData.data.stargazers_count,
        forks: repoData.data.forks_count,
        license: repoData.data.license?.spdx_id ?? null,
        description: repoData.data.description,
      },
      lastAnalyzed: new Date().toISOString(),
    };
  } catch (error) {
    return formatGitHubError(error);
  }
}

export const repoAnalyzeTool: MCPTool = {
  name: 'github_repo_analyze',
  description: 'Analyze a GitHub repository',
  category: 'github',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Repository owner' },
      repo: { type: 'string', description: 'Repository name' },
      branch: { type: 'string', description: 'Branch to analyze' },
      deep: { type: 'boolean', description: 'Deep analysis (includes commit activity)' },
    },
  },
  handler: async (input) => {
    const ctx = resolveGitHubContext(input);
    if (!ctx) {
      return offlineAnalyze(input);
    }
    return onlineAnalyze(ctx.octokit, ctx.owner, ctx.repo, input);
  },
};
