/**
 * Utility helpers: spawn with limits, temp files, output truncation.
 */
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';
import { SpawnResult, SandboxConfig } from './types';

export async function limitedSpawn(
  cmd: string,
  args: string[],
  options: {
    cwd: string;
    env: Record<string, string>;
    timeoutMs: number;
    maxOutputBytes: number;
    stdin?: string;
  }
): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: false,
      detached: false,
    });

    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let killed = false;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      killed = true;
      child.kill('SIGTERM');
      // Force kill after grace period
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 5000);
    }, options.timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < options.maxOutputBytes) {
        stdout = Buffer.concat([stdout, chunk]);
        if (stdout.length > options.maxOutputBytes) {
          stdout = stdout.subarray(0, options.maxOutputBytes);
        }
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < options.maxOutputBytes) {
        stderr = Buffer.concat([stderr, chunk]);
        if (stderr.length > options.maxOutputBytes) {
          stderr = stderr.subarray(0, options.maxOutputBytes);
        }
      }
    });

    if (options.stdin !== undefined) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        stdout: stdout.toString('utf-8'),
        stderr: `${stderr.toString('utf-8')}
[spawn error: ${err.message}]`,
        exitCode: null,
        killed,
        timedOut,
      });
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({
        stdout: stdout.toString('utf-8'),
        stderr: stderr.toString('utf-8'),
        exitCode: code,
        killed,
        timedOut,
      });
    });
  });
}

export async function createTempFile(sandboxDir: string, suffix: string, content: string): Promise<string> {
  const tmpDir = join(sandboxDir, '.tmp');
  await fs.mkdir(tmpDir, { recursive: true });
  const name = `exec_${Date.now()}_${Math.random().toString(36).slice(2)}${suffix}`;
  const path = join(tmpDir, name);
  await fs.writeFile(path, content, 'utf-8');
  return path;
}

export async function cleanupTempFile(path: string): Promise<void> {
  try {
    await fs.unlink(path);
  } catch {
    // ignore cleanup errors
  }
}

export function truncateOutput(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf-8');
  if (buf.length <= maxBytes) return text;
  const truncated = buf.subarray(0, maxBytes).toString('utf-8');
  return truncated + '\n[output truncated]';
}

export function buildToolResult(text: string, isError = false): { content: Array<{ type: 'text'; text: string }>; isError?: boolean } {
  return { content: [{ type: 'text', text }], isError };
}

export function getConfig(): SandboxConfig {
  const sandboxDir = process.env.SANDBOX_DIR || './sandbox';
  const resolvedSandbox = sandboxDir.startsWith('/')
    ? sandboxDir
    : join(process.cwd(), sandboxDir);

  return {
    sandboxDir: resolvedSandbox,
    defaultTimeoutMs: parseInt(process.env.EXEC_TIMEOUT_MS || '30000', 10),
    maxOutputBytes: parseInt(process.env.MAX_OUTPUT_BYTES || '524288', 10),
    allowedDomains: process.env.ALLOWED_DOMAINS
      ? process.env.ALLOWED_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean)
      : null,
    blockedDomains: process.env.BLOCKED_DOMAINS
      ? process.env.BLOCKED_DOMAINS.split(',').map((d) => d.trim()).filter(Boolean)
      : [],
    transport: (process.env.TRANSPORT as 'stdio' | 'http') || 'stdio',
    httpPort: parseInt(process.env.PORT || '3456', 10),
  };
}
