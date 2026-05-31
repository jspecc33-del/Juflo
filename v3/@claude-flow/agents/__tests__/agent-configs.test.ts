import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = resolve(__dirname, '..');

/**
 * Minimal YAML parser for the flat agent config format.
 * Handles: string values, quoted strings, and list values (  - item).
 */
function parseAgentYaml(content: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = content.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

  let currentKey: string | null = null;
  let currentList: string[] = [];

  const flushList = () => {
    if (currentKey && currentList.length > 0) {
      result[currentKey] = [...currentList];
      currentList = [];
      currentKey = null;
    }
  };

  for (const line of lines) {
    const listMatch = line.match(/^  - (.+)$/);
    if (listMatch && currentKey) {
      currentList.push(listMatch[1].trim());
      continue;
    }

    flushList();

    const kvMatch = line.match(/^([\w-]+):\s*(.*)$/);
    if (kvMatch) {
      const [, key, value] = kvMatch;
      const trimmed = value.trim();
      if (trimmed === '') {
        currentKey = key;
        currentList = [];
      } else {
        result[key] = trimmed.replace(/^"|"$/g, '').replace(/^'|'$/g, '');
      }
    }
  }

  flushList();
  return result;
}

const yamlFiles = readdirSync(AGENTS_DIR).filter(f => f.endsWith('.yaml'));
const agentConfigs = yamlFiles.map(file => ({
  file,
  config: parseAgentYaml(readFileSync(join(AGENTS_DIR, file), 'utf8')),
}));

describe('@claude-flow/agents — YAML configuration files', () => {
  it('contains at least one agent definition', () => {
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  it('defines all expected agent types', () => {
    const types = agentConfigs.map(({ config }) => config['type'] as string);
    for (const expected of ['architect', 'coder', 'reviewer', 'tester', 'security-architect']) {
      expect(types).toContain(expected);
    }
  });

  it('has no duplicate agent types', () => {
    const types = agentConfigs.map(({ config }) => config['type'] as string);
    expect(new Set(types).size).toBe(types.length);
  });

  it('every file name matches its type field', () => {
    for (const { file, config } of agentConfigs) {
      const expectedType = file.replace('.yaml', '');
      expect(config['type']).toBe(expectedType);
    }
  });

  describe.each(agentConfigs.map(({ file, config }) => [file, config] as [string, Record<string, unknown>]))(
    '%s',
    (_file, config) => {
      it('has a non-empty type string', () => {
        expect(typeof config['type']).toBe('string');
        expect((config['type'] as string).length).toBeGreaterThan(0);
      });

      it('has version 3.0.0', () => {
        expect(config['version']).toBe('3.0.0');
      });

      it('has a non-empty capabilities array', () => {
        expect(Array.isArray(config['capabilities'])).toBe(true);
        expect((config['capabilities'] as string[]).length).toBeGreaterThan(0);
      });

      it('has all capabilities as non-empty strings', () => {
        for (const cap of config['capabilities'] as string[]) {
          expect(typeof cap).toBe('string');
          expect(cap.length).toBeGreaterThan(0);
        }
      });

      it('has a non-empty optimizations array', () => {
        expect(Array.isArray(config['optimizations'])).toBe(true);
        expect((config['optimizations'] as string[]).length).toBeGreaterThan(0);
      });

      it('has a valid ISO 8601 createdAt timestamp', () => {
        const val = config['createdAt'];
        expect(typeof val).toBe('string');
        const date = new Date(val as string);
        expect(Number.isNaN(date.getTime())).toBe(false);
      });
    },
  );
});
