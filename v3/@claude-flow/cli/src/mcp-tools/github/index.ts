/**
 * GitHub MCP Tools for CLI
 *
 * Each tool resolves an online context (Octokit + owner/repo) when both
 * GITHUB_TOKEN/GH_TOKEN and `owner`/`repo` are provided, and falls back to
 * local JSON-store-backed placeholder behavior otherwise.
 */

import type { MCPTool } from '../types.js';
import { repoAnalyzeTool } from './repo.js';
import { prManageTool } from './pull-requests.js';
import { issueTrackTool } from './issues.js';
import { workflowTool } from './workflows.js';
import { metricsTool } from './metrics.js';

export const githubTools: MCPTool[] = [repoAnalyzeTool, prManageTool, issueTrackTool, workflowTool, metricsTool];
