/**
 * GitHub Bridge Plugin - MCP Tool Registry
 *
 * Aggregates the five GitHub Bridge MCP tools and exposes lookup helpers
 * used by the plugin entry point and the CLI's MCP tool registry.
 *
 * @module github-bridge/tools
 */

import type { MCPTool, ToolContext, MCPToolResult } from '../types.js';
import { repoAnalyzeTool } from './repo.js';
import { prManageTool } from './pull-requests.js';
import { issueTrackTool } from './issues.js';
import { workflowTool } from './workflows.js';
import { metricsTool } from './metrics.js';

export { repoAnalyzeTool, prManageTool, issueTrackTool, workflowTool, metricsTool };
export type { RepoAnalysis } from './repo.js';
export type { PRSummary, PRManageResult } from './pull-requests.js';
export type { IssueSummary, IssueTrackResult } from './issues.js';
export type { WorkflowSummary, WorkflowRunSummary, WorkflowResult } from './workflows.js';
export type { CommitActivity, ContributorStat, TrafficStats, ReleaseSummary, MetricsResult } from './metrics.js';

/** All GitHub Bridge MCP tools, in registration order. */
export const githubBridgeTools: MCPTool[] = [
  repoAnalyzeTool as unknown as MCPTool,
  prManageTool as unknown as MCPTool,
  issueTrackTool as unknown as MCPTool,
  workflowTool as unknown as MCPTool,
  metricsTool as unknown as MCPTool,
];

/** Tool name -> handler lookup. */
export const toolHandlers = new Map<string, MCPTool['handler']>(
  githubBridgeTools.map((tool) => [tool.name, tool.handler]),
);

/** Get a tool definition by name. */
export function getTool(name: string): MCPTool | undefined {
  return githubBridgeTools.find((tool) => tool.name === name);
}

export type { MCPTool, ToolContext, MCPToolResult };
