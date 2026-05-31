/**
 * RH Skills Plugin
 *
 * Converts shell automation skill definitions (skills.json) into MCP tools
 * using the @claude-flow/plugins SDK.
 *
 * Each skill becomes a callable tool named `rh-skills/{skill.id}` with:
 * - {{param}} template substitution (shell-escaped via escapeShellArg)
 * - Zod-validated input schema generated from the params array
 * - Injected runner for testability (defaults to promisified exec)
 *
 * @example
 * ```typescript
 * import { quickPlugin } from '@claude-flow/plugins';
 * import rhSkillsPlugin from './examples/rh-skills/plugin.js';
 *
 * await getDefaultRegistry().register(rhSkillsPlugin);
 * ```
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PluginBuilder, MCPToolBuilder } from '../../src/sdk/index.js';
import type { MCPToolDefinition } from '../../src/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Types
// ============================================================================

export interface SkillParam {
  name: string;
  desc: string;
  required: boolean;
  defaultValue?: string;
}

export interface Skill {
  id: string;
  name: string;
  desc: string;
  command: string;
  category: string;
  params: SkillParam[];
  tags: string[];
  author: string;
  created: string;
}

export type Runner = (cmd: string) => Promise<{ stdout: string; stderr: string }>;

// ============================================================================
// Helpers (exported for testability)
// ============================================================================

/**
 * Wraps a shell argument in single quotes, escaping any internal single quotes.
 * Prevents injection via {{param}} substitutions.
 */
export function escapeShellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}' `;
}

/**
 * Replaces all `{{key}}` placeholders in a command with shell-escaped values.
 * Unknown placeholders are left as-is.
 */
export function substituteParams(
  command: string,
  params: Record<string, string>
): string {
  return Object.entries(params).reduce(
    (cmd, [key, value]) => cmd.replaceAll(`{{${key}}}`, escapeShellArg(value).trim()),
    command
  );
}

/**
 * Builds an MCPToolDefinition from a Skill.
 *
 * @param skill  - The skill definition
 * @param runner - Optional exec replacement for testing (defaults to promisified exec)
 */
export function buildToolFromSkill(
  skill: Skill,
  runner: Runner = defaultRunner
): MCPToolDefinition {
  const builder = new MCPToolBuilder(`rh-skills/${skill.id}`)
    .withDescription(`[${skill.category}] ${skill.desc}`);

  for (const param of skill.params) {
    builder.addStringParam(param.name, param.desc, {
      required: param.required,
      default: param.defaultValue,
    });
  }

  builder.withHandler(async (input: Record<string, unknown>) => {
    const resolved: Record<string, string> = {};

    for (const param of skill.params) {
      const val = input[param.name];
      if (param.required && val === undefined) {
        throw new Error(`Required parameter '${param.name}' is missing`);
      }
      resolved[param.name] = String(val ?? param.defaultValue ?? '');
    }

    const command = substituteParams(skill.command, resolved);

    try {
      const { stdout, stderr } = await runner(command);
      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      return {
        content: [{ type: 'text', text: output || '(no output)' }],
      };
    } catch (err: unknown) {
      const e = err as { message?: string; stdout?: string; stderr?: string };
      const detail = [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim();
      return {
        content: [{ type: 'text', text: `Error: ${detail}` }],
        isError: true,
      };
    }
  });

  return builder.build();
}

// ============================================================================
// Default runner (uses real exec; swapped out in tests)
// ============================================================================

const execAsync = promisify(exec);

const defaultRunner: Runner = (cmd) =>
  execAsync(cmd, { timeout: 60_000, maxBuffer: 1024 * 1024 });

// ============================================================================
// Skills data
// ============================================================================

export const SKILLS: Skill[] = JSON.parse(
  readFileSync(join(__dirname, 'skills.json'), 'utf-8')
);

// ============================================================================
// Plugin
// ============================================================================

export const rhSkillsPlugin = new PluginBuilder('rh-skills', '1.0.0')
  .withDescription(
    'Shell automation skills as MCP tools — security audits, Docker ops, SSL cert checks'
  )
  .withAuthor('RH Security / DevOps Team')
  .withTags(['security', 'containers', 'ssl', 'automation', 'devops'])
  .withMCPTools(SKILLS.map(s => buildToolFromSkill(s)))
  .onInitialize(async () => {
    for (const skill of SKILLS) {
      console.log(`[rh-skills] rh-skills/${skill.id} ready — ${skill.desc}`);
    }
  })
  .build();

export default rhSkillsPlugin;
