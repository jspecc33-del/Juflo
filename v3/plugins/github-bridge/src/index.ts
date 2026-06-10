/**
 * GitHub Bridge Plugin - Entry Point
 *
 * Implements the claude-flow `IPlugin` interface and exposes the five
 * GitHub Bridge MCP tools (repository analysis, pull request management,
 * issue tracking, workflow automation, and repository metrics) backed by
 * a live Octokit client.
 *
 * @module github-bridge
 * @version 0.1.0
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import type {
  IPlugin,
  PluginContext,
  PluginMCPTool,
  PluginHook,
  GitHubBridgeConfig,
  MCPTool,
  ToolContext,
} from './types.js';
import { GitHubClient, createGitHubClient } from './client.js';
import { githubBridgeTools } from './tools/index.js';

export class GitHubBridgePlugin implements IPlugin {
  readonly name = '@claude-flow/plugin-github-bridge';
  readonly version = '0.1.0';
  readonly description =
    'Live GitHub API integration via Octokit: repository analysis, pull request management, issue tracking, workflow automation, and metrics.';

  private readonly client: GitHubClient;
  private readonly toolContext: ToolContext;

  constructor(config: GitHubBridgeConfig = {}) {
    this.client = createGitHubClient(config);
    this.toolContext = { client: this.client };
  }

  async register(context: PluginContext): Promise<void> {
    context.set('github-bridge', this);
    context.set('github.authenticated', this.client.isAuthenticated());
  }

  async initialize(_context: PluginContext): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async shutdown(_context: PluginContext): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  getCapabilities(): string[] {
    return [
      'repo-analysis',
      'pull-request-management',
      'issue-tracking',
      'workflow-automation',
      'repo-metrics',
    ];
  }

  getMCPTools(): PluginMCPTool[] {
    return githubBridgeTools.map((tool) => this.convertTool(tool));
  }

  getHooks(): PluginHook[] {
    return [];
  }

  /** Direct access to the underlying GitHub client (for tests and advanced use). */
  getClient(): GitHubClient {
    return this.client;
  }

  private convertTool(tool: MCPTool): PluginMCPTool {
    const schema = zodToJsonSchema(tool.inputSchema, {
      target: 'jsonSchema7',
      $refStrategy: 'none',
    }) as unknown as { type?: 'object'; properties?: Record<string, unknown>; required?: string[] };

    return {
      name: tool.name,
      description: tool.description,
      category: tool.category,
      inputSchema: {
        type: 'object',
        properties: schema.properties ?? {},
        required: schema.required,
      },
      handler: async (input) => {
        const result = await tool.handler(input, this.toolContext);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      },
    };
  }
}

export function createGitHubBridgePlugin(config?: GitHubBridgeConfig): GitHubBridgePlugin {
  return new GitHubBridgePlugin(config);
}

export * from './types.js';
export * from './client.js';
export * from './errors.js';
export * from './validators.js';

export {
  repoAnalyzeTool,
  prManageTool,
  issueTrackTool,
  workflowTool,
  metricsTool,
  githubBridgeTools,
  toolHandlers,
  getTool,
} from './tools/index.js';
export type {
  RepoAnalysis,
  PRSummary,
  PRManageResult,
  IssueSummary,
  IssueTrackResult,
  WorkflowSummary,
  WorkflowRunSummary,
  WorkflowResult,
  CommitActivity,
  ContributorStat,
  TrafficStats,
  ReleaseSummary,
  MetricsResult,
} from './tools/index.js';

export default GitHubBridgePlugin;
