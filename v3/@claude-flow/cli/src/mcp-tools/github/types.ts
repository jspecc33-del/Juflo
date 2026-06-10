/**
 * Shared types for GitHub MCP Tools (offline store + online summaries)
 */

export interface RepoInfo {
  owner: string;
  name: string;
  branch: string;
  lastAnalyzed?: string;
  metrics?: {
    commits: number;
    branches: number;
    contributors: number;
    openIssues: number;
    openPRs: number;
  };
}

export interface GitHubStore {
  repos: Record<string, RepoInfo>;
  prs: Record<string, { id: string; title: string; status: string; branch: string; createdAt: string }>;
  issues: Record<string, { id: string; title: string; status: string; labels: string[]; createdAt: string }>;
  version: string;
}

export interface PullRequestSummary {
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
