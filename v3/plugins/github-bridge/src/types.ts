/**
 * GitHub Bridge Plugin - Shared Types
 *
 * Type definitions for the GitHub Bridge plugin: the Octokit-backed
 * client contract, MCP tool contracts, and the lightweight plugin
 * interface used to register the bridge with claude-flow.
 *
 * @module github-bridge/types
 * @version 0.1.0
 */

import type { Octokit } from '@octokit/rest';
import type { z } from 'zod';

// ============================================================================
// GitHub Client
// ============================================================================

/**
 * Configuration for the GitHub Bridge client
 */
export interface GitHubBridgeConfig {
  /** Personal access token / GitHub App installation token. Falls back to
   *  GITHUB_TOKEN / GH_TOKEN environment variables when omitted. */
  token?: string;
  /** Override the API base URL (e.g. for GitHub Enterprise Server) */
  baseUrl?: string;
  /** User-Agent header sent with every request */
  userAgent?: string;
  /** Default repository owner used when a tool call omits one */
  defaultOwner?: string;
  /** Default repository name used when a tool call omits one */
  defaultRepo?: string;
  /** Pre-constructed Octokit instance (used for testing/dependency injection) */
  octokit?: Octokit;
}

/**
 * Contract implemented by {@link GitHubClient}. Tool modules depend on this
 * interface (rather than the concrete class) so tests can inject fakes.
 */
export interface IGitHubClient {
  /** Underlying Octokit REST client */
  readonly octokit: Octokit;
  /** Default repository owner/name, if configured */
  readonly defaults: { owner?: string; repo?: string };
  /** Whether a token was supplied (write operations require this) */
  isAuthenticated(): boolean;
  /** Run an Octokit call, translating failures into GitHubBridgeError */
  execute<T>(action: string, operation: () => Promise<T>): Promise<T>;
  /** Resolve owner/repo from input, falling back to configured defaults */
  resolveRepo(input: { owner?: string; repo?: string }): { owner: string; repo: string };
  /** Throw GH_AUTH_REQUIRED if no token is configured. Call before mutating operations. */
  requireAuth(action: string): void;
}

// ============================================================================
// MCP Tool Contracts
// ============================================================================

/**
 * Standard result envelope returned by every GitHub Bridge MCP tool.
 */
export interface MCPToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
}

/**
 * Execution context handed to every tool handler.
 */
export interface ToolContext {
  client: IGitHubClient;
}

/**
 * MCP tool definition. Input is validated against `inputSchema` before the
 * handler is invoked.
 */
export interface MCPTool<TInput = unknown, TOutput = unknown> {
  /** Tool name (e.g. "github_repo_analyze") */
  name: string;
  /** Human readable description */
  description: string;
  /** Tool category, used for grouping in registries */
  category: string;
  /** Whether the tool performs a write/mutating operation */
  mutating: boolean;
  /** Zod schema describing and validating tool input */
  inputSchema: z.ZodType<TInput>;
  /** Tool handler */
  handler: (input: TInput, context: ToolContext) => Promise<MCPToolResult<TOutput>>;
}

// ============================================================================
// Plugin Interface (claude-flow plugin system)
// ============================================================================

export interface PluginContext {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
}

export interface PluginMCPTool {
  name: string;
  description: string;
  category: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (input: unknown, context: PluginContext) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

export type HookPriority = number;

export interface PluginHook {
  name: string;
  event: string;
  priority: HookPriority;
  description: string;
  handler: (context: PluginContext, payload: unknown) => Promise<unknown>;
}

export interface IPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  register(context: PluginContext): Promise<void>;
  initialize(context: PluginContext): Promise<{ success: boolean; error?: string }>;
  shutdown(context: PluginContext): Promise<{ success: boolean; error?: string }>;
  getCapabilities(): string[];
  getMCPTools(): PluginMCPTool[];
  getHooks(): PluginHook[];
}
