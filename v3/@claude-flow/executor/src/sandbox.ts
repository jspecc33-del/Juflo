/**
 * Sandbox directory management and path validation.
 */
import { promises as fs } from 'fs';
import { join, resolve, normalize } from 'path';
import { SandboxConfig } from './types';

export async function ensureSandbox(config: SandboxConfig): Promise<void> {
  await fs.mkdir(config.sandboxDir, { recursive: true });
  await fs.mkdir(join(config.sandboxDir, '.tmp'), { recursive: true });
}

/**
 * Resolve a user-provided working_dir relative to the sandbox.
 * Prevents path traversal outside the sandbox.
 */
export function resolveSandboxPath(userPath: string | undefined, sandboxDir: string): string {
  if (!userPath) return sandboxDir;

  const normalized = normalize(userPath);
  if (normalized.startsWith('..') || normalized.includes('/../') || normalized.includes('\\..\\')) {
    throw new Error(`Path traversal detected: ${userPath}`);
  }

  const resolved = resolve(join(sandboxDir, normalized));
  // Double-check it's still inside sandbox
  if (!resolved.startsWith(sandboxDir)) {
    throw new Error(`Path escapes sandbox: ${userPath}`);
  }
  return resolved;
}

export function buildSandboxEnv(config: SandboxConfig, extraEnv?: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {
    HOME: config.sandboxDir,
    TMPDIR: join(config.sandboxDir, '.tmp'),
    TEMP: join(config.sandboxDir, '.tmp'),
    TMP: join(config.sandboxDir, '.tmp'),
    PWD: config.sandboxDir,
    ...(extraEnv || {}),
  };

  // Restrict PATH to system defaults — do not inherit user's custom PATH
  const safePath = process.env.PATH || '/usr/local/bin:/usr/bin:/bin';
  env.PATH = safePath;

  return env;
}
