/**
 * exec_bash — Run shell commands inside the sandbox.
 */
import { BashArgs, SandboxConfig, ToolResult } from '../types';
import { limitedSpawn, buildToolResult, truncateOutput } from '../utils';
import { resolveSandboxPath, buildSandboxEnv } from '../sandbox';
import { sanitizeCommand } from '../security';

export const name = 'exec_bash';
export const description = 'Run any bash command in the sandbox. File operations, system info, package installs, piping commands.';
export const inputSchema = {
  type: 'object',
  properties: {
    command: { type: 'string', description: 'The bash command to execute' },
    working_dir: { type: 'string', description: 'Optional subdirectory inside the sandbox' },
    env: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Optional extra environment variables',
    },
    timeout_ms: { type: 'number', description: 'Optional timeout override in milliseconds' },
  },
  required: ['command'],
};

export async function handler(args: Record<string, unknown>, config: SandboxConfig): Promise<ToolResult> {
  const params = args as unknown as BashArgs;
  const command = sanitizeCommand(params.command);
  const cwd = resolveSandboxPath(params.working_dir, config.sandboxDir);
  const env = buildSandboxEnv(config, params.env);
  const timeout = params.timeout_ms ?? config.defaultTimeoutMs;

  const result = await limitedSpawn('bash', ['-c', command], {
    cwd,
    env,
    timeoutMs: timeout,
    maxOutputBytes: config.maxOutputBytes,
  });

  let text = '';
  if (result.timedOut) {
    text += '[TIMED OUT]\n';
  }
  if (result.stdout) {
    text += `STDOUT:\n${truncateOutput(result.stdout, config.maxOutputBytes)}\n`;
  }
  if (result.stderr) {
    text += `STDERR:\n${truncateOutput(result.stderr, config.maxOutputBytes)}\n`;
  }
  text += `EXIT_CODE: ${result.exitCode ?? 'null'}\n`;

  return buildToolResult(text, result.exitCode !== 0 || result.timedOut);
}
