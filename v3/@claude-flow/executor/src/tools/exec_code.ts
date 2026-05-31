/**
 * exec_code — Execute Python, JavaScript, or TypeScript code snippets.
 */
import { CodeArgs, SandboxConfig, ToolResult } from '../types';
import { limitedSpawn, buildToolResult, createTempFile, cleanupTempFile, truncateOutput } from '../utils';
import { buildSandboxEnv } from '../sandbox';

export const name = 'exec_code';
export const description = 'Execute Python, JavaScript, or TypeScript code snippets. Data processing, calculations, testing algorithms.';
export const inputSchema = {
  type: 'object',
  properties: {
    language: {
      type: 'string',
      enum: ['python', 'javascript', 'typescript'],
      description: 'Programming language',
    },
    code: { type: 'string', description: 'The code to execute' },
    stdin: { type: 'string', description: 'Optional stdin input' },
    timeout_ms: { type: 'number', description: 'Optional timeout in milliseconds' },
    args: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional CLI arguments passed to the script',
    },
  },
  required: ['language', 'code'],
};

export async function handler(args: Record<string, unknown>, config: SandboxConfig): Promise<ToolResult> {
  const params = args as unknown as CodeArgs;
  const timeout = params.timeout_ms ?? config.defaultTimeoutMs;
  const env = buildSandboxEnv(config);

  let cmd: string;
  let cmdArgs: string[];
  let tempFile: string | null = null;

  switch (params.language) {
    case 'python': {
      tempFile = await createTempFile(config.sandboxDir, '.py', params.code);
      cmd = 'python3';
      cmdArgs = [tempFile, ...(params.args || [])];
      break;
    }
    case 'javascript': {
      tempFile = await createTempFile(config.sandboxDir, '.js', params.code);
      cmd = 'node';
      cmdArgs = [tempFile, ...(params.args || [])];
      break;
    }
    case 'typescript': {
      tempFile = await createTempFile(config.sandboxDir, '.ts', params.code);
      // Try tsx first, then ts-node, then fallback to node (if .ts is somehow supported)
      const candidates = ['tsx', 'ts-node', 'node'];
      let found = false;
      for (const candidate of candidates) {
        try {
          const check = await limitedSpawn('which', [candidate], {
            cwd: config.sandboxDir,
            env,
            timeoutMs: 2000,
            maxOutputBytes: 1024,
          });
          if (check.exitCode === 0) {
            cmd = candidate;
            found = true;
            break;
          }
        } catch {
          // continue
        }
      }
      if (!found) {
        return buildToolResult(
          'Error: No TypeScript runner found. Install tsx or ts-node globally, or use javascript.',
          true
        );
      }
      cmdArgs = [tempFile, ...(params.args || [])];
      break;
    }
    default:
      return buildToolResult(`Unsupported language: ${params.language}`, true);
  }

  // Attempt network isolation on Linux via unshare
  const isLinux = process.platform === 'linux';
  let finalCmd = cmd;
  let finalArgs = cmdArgs;
  if (isLinux) {
    try {
      const unshareCheck = await limitedSpawn('which', ['unshare'], {
        cwd: config.sandboxDir,
        env,
        timeoutMs: 2000,
        maxOutputBytes: 1024,
      });
      if (unshareCheck.exitCode === 0) {
        finalCmd = 'unshare';
        finalArgs = ['-n', cmd, ...cmdArgs];
      }
    } catch {
      // unshare not available, run without network isolation
    }
  }

  const result = await limitedSpawn(finalCmd, finalArgs, {
    cwd: config.sandboxDir,
    env,
    timeoutMs: timeout,
    maxOutputBytes: config.maxOutputBytes,
    stdin: params.stdin,
  });

  if (tempFile) {
    await cleanupTempFile(tempFile);
  }

  let text = '';
  if (result.timedOut) {
    text += '[TIMED OUT]\n';
  }
  if (!isLinux) {
    text += '[WARNING: Network isolation not available on this platform]\n';
  } else if (finalCmd === 'unshare') {
    text += '[Network isolated via unshare]\n';
  } else {
    text += '[WARNING: unshare not available — network NOT isolated]\n';
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
