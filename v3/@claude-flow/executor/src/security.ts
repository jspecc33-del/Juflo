/**
 * Security policies: domain filtering, output limits, input sanitization.
 */
import { URL } from 'url';
import { SandboxConfig } from './types';

export function checkDomain(urlStr: string, config: SandboxConfig): void {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid URL: ${urlStr}`);
  }

  // Check blocked list first
  for (const blocked of config.blockedDomains) {
    if (hostname === blocked.toLowerCase() || hostname.endsWith(`.${blocked.toLowerCase()}`)) {
      throw new Error(`Domain blocked by policy: ${hostname}`);
    }
  }

  // Check allowed list if configured
  if (config.allowedDomains && config.allowedDomains.length > 0) {
    let allowed = false;
    for (const allowedDomain of config.allowedDomains) {
      const ad = allowedDomain.toLowerCase();
      if (hostname === ad || hostname.endsWith(`.${ad}`)) {
        allowed = true;
        break;
      }
    }
    if (!allowed) {
      throw new Error(`Domain not in allowlist: ${hostname}`);
    }
  }
}

export function sanitizeCommand(cmd: string): string {
  // Basic check for obvious dangerous patterns in bash commands
  const dangerous = [
    /;\s*rm\s+-rf\s+\//,
    /\`.*rm\s+-rf\s+\//,
    /\$\(.*rm\s+-rf\s+\//,
    />\s*\/dev\/null.*&&.*rm/,
  ];
  for (const pattern of dangerous) {
    if (pattern.test(cmd)) {
      throw new Error('Command contains potentially dangerous pattern and was rejected.');
    }
  }
  return cmd;
}
