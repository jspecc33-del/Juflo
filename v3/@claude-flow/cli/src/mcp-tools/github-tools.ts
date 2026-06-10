/**
 * GitHub MCP Tools for CLI
 *
 * Re-exports the GitHub tool set from ./github/. Each tool uses the real
 * GitHub API (via @octokit/rest) when GITHUB_TOKEN/GH_TOKEN and `owner`/`repo`
 * are available, and falls back to local JSON-store-backed placeholder
 * behavior otherwise.
 */

export { githubTools } from './github/index.js';
