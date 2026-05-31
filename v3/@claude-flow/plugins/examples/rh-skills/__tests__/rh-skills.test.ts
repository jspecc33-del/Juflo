import { describe, it, expect, vi } from 'vitest';
import {
  escapeShellArg,
  substituteParams,
  buildToolFromSkill,
  SKILLS,
  rhSkillsPlugin,
  type Skill,
} from '../plugin.js';

// ============================================================================
// Fixtures
// ============================================================================

const skillNoParams: Skill = {
  id: 'skill-1',
  name: 'Security Audit Runner',
  desc: 'Run lynis audit and generate a summary report',
  command: 'sudo lynis audit system --quick 2>&1 | tee /tmp/lynis-report.txt',
  category: 'security',
  params: [],
  tags: ['audit', 'lynis'],
  author: 'RH Security',
  created: '2025-01-15',
};

const skillWithParams: Skill = {
  id: 'skill-3',
  name: 'SSL Cert Check',
  desc: 'Check SSL certificate expiry for a domain',
  command:
    'echo | openssl s_client -servername {{domain}} -connect {{domain}}:443 2>/dev/null | openssl x509 -noout -dates',
  category: 'security',
  params: [
    {
      name: 'domain',
      desc: 'Domain to check',
      required: true,
      defaultValue: 'example.com',
    },
  ],
  tags: ['ssl', 'openssl'],
  author: 'RH Security',
  created: '2025-02-10',
};

// ============================================================================
// escapeShellArg
// ============================================================================

describe('escapeShellArg', () => {
  it('wraps a plain value in single quotes', () => {
    expect(escapeShellArg('example.com')).toBe("'example.com'");
  });

  it('escapes internal single quotes with backslash sequence', () => {
    expect(escapeShellArg("it's")).toBe("'it'\\''s'");
  });

  it('handles an empty string', () => {
    expect(escapeShellArg('')).toBe("''");
  });

  it('does not alter alphanumeric and safe chars', () => {
    expect(escapeShellArg('hello-world_123')).toBe("'hello-world_123'");
  });
});

// ============================================================================
// substituteParams
// ============================================================================

describe('substituteParams', () => {
  it('replaces a single placeholder', () => {
    expect(substituteParams('echo {{name}}', { name: 'alice' })).toBe("echo 'alice'");
  });

  it('replaces the same placeholder multiple times', () => {
    const cmd = 'openssl s_client -servername {{domain}} -connect {{domain}}:443';
    const result = substituteParams(cmd, { domain: 'example.com' });
    expect(result).toBe(
      "openssl s_client -servername 'example.com' -connect 'example.com':443"
    );
  });

  it('leaves unknown placeholders untouched', () => {
    expect(substituteParams('cmd {{unknown}}', { other: 'val' })).toBe('cmd {{unknown}}');
  });

  it('does not modify a command with no placeholders', () => {
    const cmd = 'sudo lynis audit system';
    expect(substituteParams(cmd, {})).toBe(cmd);
  });

  it('shell-escapes values containing injection characters', () => {
    const result = substituteParams('run {{msg}}', { msg: 'hello; rm -rf /' });
    expect(result).toBe("run 'hello; rm -rf /'");
    expect(result).not.toContain('rm -rf /');
  });
});

// ============================================================================
// buildToolFromSkill — structure
// ============================================================================

describe('buildToolFromSkill — structure', () => {
  it('names the tool rh-skills/{id}', () => {
    const tool = buildToolFromSkill(skillNoParams, vi.fn());
    expect(tool.name).toBe('rh-skills/skill-1');
  });

  it('includes category in description', () => {
    const tool = buildToolFromSkill(skillNoParams, vi.fn());
    expect(tool.description).toContain('[security]');
  });

  it('includes the skill desc in description', () => {
    const tool = buildToolFromSkill(skillNoParams, vi.fn());
    expect(tool.description).toContain('lynis audit');
  });

  it('has no required array for a param-less skill', () => {
    const tool = buildToolFromSkill(skillNoParams, vi.fn());
    expect((tool.inputSchema as { required?: unknown }).required).toBeUndefined();
  });

  it('adds required params to the JSON schema', () => {
    const tool = buildToolFromSkill(skillWithParams, vi.fn());
    const schema = tool.inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(schema.required).toContain('domain');
    expect(schema.properties['domain']).toBeDefined();
  });

  it('carries the defaultValue into the schema', () => {
    const tool = buildToolFromSkill(skillWithParams, vi.fn());
    const schema = tool.inputSchema as {
      properties: Record<string, { default?: string }>;
    };
    expect(schema.properties['domain'].default).toBe('example.com');
  });
});

// ============================================================================
// buildToolFromSkill — handler
// ============================================================================

describe('buildToolFromSkill — handler', () => {
  it('calls the runner with the raw command for a param-less skill', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: 'Report saved', stderr: '' });
    const tool = buildToolFromSkill(skillNoParams, runner);
    const result = await tool.handler({});

    expect(runner).toHaveBeenCalledWith(skillNoParams.command);
    expect(result.content[0].text).toBe('Report saved');
  });

  it('substitutes params before passing to the runner', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: 'notAfter=2026-01-01', stderr: '' });
    const tool = buildToolFromSkill(skillWithParams, runner);
    await tool.handler({ domain: 'example.com' });

    const called: string = runner.mock.calls[0][0];
    expect(called).toContain("'example.com'");
    expect(called).not.toContain('{{domain}}');
  });

  it('falls back to defaultValue when param is omitted', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '' });
    const tool = buildToolFromSkill(skillWithParams, runner);
    await tool.handler({});

    const called: string = runner.mock.calls[0][0];
    expect(called).toContain("'example.com'");
  });

  it('throws when a required param with no default is missing', async () => {
    const requiredNoDefault: Skill = {
      ...skillWithParams,
      params: [{ name: 'domain', desc: 'Domain', required: true }],
    };
    const runner = vi.fn();
    const tool = buildToolFromSkill(requiredNoDefault, runner);

    await expect(tool.handler({})).rejects.toThrow("Required parameter 'domain' is missing");
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns isError:true and preserves stderr on exec failure', async () => {
    const runner = vi.fn().mockRejectedValue({
      message: 'command not found',
      stdout: '',
      stderr: 'bash: lynis: command not found',
    });
    const tool = buildToolFromSkill(skillNoParams, runner);
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Error:/);
    expect(result.content[0].text).toContain('command not found');
  });

  it('returns "(no output)" when stdout and stderr are both empty', async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
    const tool = buildToolFromSkill(skillNoParams, runner);
    const result = await tool.handler({});

    expect(result.content[0].text).toBe('(no output)');
  });
});

// ============================================================================
// SKILLS data (loaded from skills.json)
// ============================================================================

describe('SKILLS data', () => {
  it('loads exactly 3 skills', () => {
    expect(SKILLS).toHaveLength(3);
  });

  it('contains skill-1, skill-2, skill-3 in order', () => {
    expect(SKILLS.map(s => s.id)).toEqual(['skill-1', 'skill-2', 'skill-3']);
  });

  it('has at least one skill with params', () => {
    expect(SKILLS.some(s => s.params.length > 0)).toBe(true);
  });

  it('has at least one skill without params', () => {
    expect(SKILLS.some(s => s.params.length === 0)).toBe(true);
  });

  it('all skills have non-empty commands', () => {
    expect(SKILLS.every(s => s.command.length > 0)).toBe(true);
  });
});

// ============================================================================
// rhSkillsPlugin — metadata & registration
// ============================================================================

describe('rhSkillsPlugin', () => {
  it('has name "rh-skills"', () => {
    expect(rhSkillsPlugin.metadata.name).toBe('rh-skills');
  });

  it('has version "1.0.0"', () => {
    expect(rhSkillsPlugin.metadata.version).toBe('1.0.0');
  });

  it('includes "security" in tags', () => {
    expect(rhSkillsPlugin.metadata.tags).toContain('security');
  });

  it('includes "automation" in tags', () => {
    expect(rhSkillsPlugin.metadata.tags).toContain('automation');
  });

  it('registers exactly 3 MCP tools', () => {
    const tools = rhSkillsPlugin.registerMCPTools?.() ?? [];
    expect(tools).toHaveLength(3);
  });

  it('exposes a tool for every skill id', () => {
    const tools = rhSkillsPlugin.registerMCPTools?.() ?? [];
    const names = tools.map(t => t.name);
    expect(names).toContain('rh-skills/skill-1');
    expect(names).toContain('rh-skills/skill-2');
    expect(names).toContain('rh-skills/skill-3');
  });

  it('implements initialize and shutdown lifecycle methods', () => {
    expect(typeof rhSkillsPlugin.initialize).toBe('function');
    expect(typeof rhSkillsPlugin.shutdown).toBe('function');
  });
});
