/**
 * Shared type definitions for the Executor MCP Server.
 */

export interface SandboxConfig {
  sandboxDir: string;
  defaultTimeoutMs: number;
  maxOutputBytes: number;
  allowedDomains: string[] | null;
  blockedDomains: string[];
  transport: 'stdio' | 'http';
  httpPort: number;
}

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface BashArgs {
  command: string;
  working_dir?: string;
  env?: Record<string, string>;
  timeout_ms?: number;
}

export interface CodeArgs {
  language: 'python' | 'javascript' | 'typescript';
  code: string;
  stdin?: string;
  timeout_ms?: number;
  args?: string[];
}

export interface HttpArgs {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  body?: unknown;
  timeout_ms?: number;
  response_format?: 'auto' | 'json' | 'text';
}

export interface ChainStep {
  step_id: string;
  server_command: string;
  tool_name: string;
  arguments: Record<string, unknown>;
  on_error: 'abort' | 'continue';
}

export interface ChainArgs {
  description: string;
  steps: ChainStep[];
}

export interface SandboxInfoArgs {
  // no args
}

export interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  killed: boolean;
  timedOut: boolean;
}

// MCP Protocol types
export interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpServerCapabilities {
  tools: { listChanged?: boolean };
}

export interface McpServerInfo {
  name: string;
  version: string;
}
