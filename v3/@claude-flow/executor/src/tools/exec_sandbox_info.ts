/**
 * exec_sandbox_info — Inspect the sandbox environment.
 */
import { SandboxConfig, ToolResult } from '../types';
import { buildToolResult } from '../utils';
import { promises as fs } from 'fs';
import { execSync } from 'child_process';

export const name = 'exec_sandbox_info';
export const description = 'Inspect the sandbox environment: runtimes, limits, policies, available tools.';
export const inputSchema = {
  type: 'object',
  properties: {},
};

function checkCommand(cmd: string): string {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe', timeout: 2000 });
    return 'available';
  } catch {
    return 'not found';
  }
}

export async function handler(_args: Record<string, unknown>, config: SandboxConfig): Promise<ToolResult> {
  const info = {
    sandbox_dir: config.sandboxDir,
    default_timeout_ms: config.defaultTimeoutMs,
    max_output_bytes: config.maxOutputBytes,
    transport: config.transport,
    http_port: config.httpPort,
    allowed_domains: config.allowedDomains,
    blocked_domains: config.blockedDomains,
    platform: process.platform,
    node_version: process.version,
    runtimes: {
      bash: checkCommand('bash'),
      python3: checkCommand('python3'),
      node: checkCommand('node'),
      tsx: checkCommand('tsx'),
      'ts-node': checkCommand('ts-node'),
      unshare: checkCommand('unshare'),
    },
    env_vars: {
      HOME: process.env.HOME,
      PATH: process.env.PATH,
      SANDBOX_DIR: process.env.SANDBOX_DIR,
      EXEC_TIMEOUT_MS: process.env.EXEC_TIMEOUT_MS,
      MAX_OUTPUT_BYTES: process.env.MAX_OUTPUT_BYTES,
      ALLOWED_DOMAINS: process.env.ALLOWED_DOMAINS,
      BLOCKED_DOMAINS: process.env.BLOCKED_DOMAINS,
      TRANSPORT: process.env.TRANSPORT,
      PORT: process.env.PORT,
    },
  };

  return buildToolResult(JSON.stringify(info, null, 2));
}
