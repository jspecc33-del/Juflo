/**
 * Local JSON store for offline GitHub tool state.
 *
 * Used as a fallback when no GitHub token (GITHUB_TOKEN / GH_TOKEN) or no
 * owner/repo is supplied, so the tools remain usable for local workflow
 * coordination without network access.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GitHubStore } from './types.js';

const STORAGE_DIR = '.claude-flow';
const GITHUB_DIR = 'github';
const GITHUB_FILE = 'store.json';

function getGitHubDir(): string {
  return join(process.cwd(), STORAGE_DIR, GITHUB_DIR);
}

function getGitHubPath(): string {
  return join(getGitHubDir(), GITHUB_FILE);
}

function ensureGitHubDir(): void {
  const dir = getGitHubDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export function loadGitHubStore(): GitHubStore {
  try {
    const path = getGitHubPath();
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8'));
    }
  } catch {
    // Return empty store
  }
  return { repos: {}, prs: {}, issues: {}, version: '3.0.0' };
}

export function saveGitHubStore(store: GitHubStore): void {
  ensureGitHubDir();
  writeFileSync(getGitHubPath(), JSON.stringify(store, null, 2), 'utf-8');
}
