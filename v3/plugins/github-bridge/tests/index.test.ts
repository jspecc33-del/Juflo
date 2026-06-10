/**
 * GitHub Bridge Plugin - Entry Point Tests
 *
 * @module github-bridge/tests/index
 */

import { describe, it, expect, vi } from 'vitest';
import type { Octokit } from '@octokit/rest';
import { GitHubBridgePlugin, createGitHubBridgePlugin, GitHubClient } from '../src/index.js';
import type { PluginContext } from '../src/types.js';

function createContext(): PluginContext {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => {
      store.set(key, value);
    },
    has: (key: string) => store.has(key),
  };
}

describe('GitHubBridgePlugin', () => {
  it('exposes plugin metadata', () => {
    const plugin = createGitHubBridgePlugin();

    expect(plugin).toBeInstanceOf(GitHubBridgePlugin);
    expect(plugin.name).toBe('@claude-flow/plugin-github-bridge');
    expect(plugin.version).toBe('0.1.0');
    expect(plugin.description).toContain('GitHub');
  });

  it('reports its capabilities', () => {
    const plugin = createGitHubBridgePlugin();

    expect(plugin.getCapabilities()).toEqual([
      'repo-analysis',
      'pull-request-management',
      'issue-tracking',
      'workflow-automation',
      'repo-metrics',
    ]);
  });

  it('registers itself and the auth status in the plugin context', async () => {
    const plugin = createGitHubBridgePlugin();
    const context = createContext();

    await plugin.register(context);

    expect(context.get('github-bridge')).toBe(plugin);
    expect(context.get('github.authenticated')).toBe(false);
  });

  it('initializes and shuts down successfully', async () => {
    const plugin = createGitHubBridgePlugin();
    const context = createContext();

    await expect(plugin.initialize(context)).resolves.toEqual({ success: true });
    await expect(plugin.shutdown(context)).resolves.toEqual({ success: true });
  });

  it('returns no hooks', () => {
    const plugin = createGitHubBridgePlugin();

    expect(plugin.getHooks()).toEqual([]);
  });

  it('exposes the underlying GitHub client', () => {
    const plugin = createGitHubBridgePlugin();

    expect(plugin.getClient()).toBeInstanceOf(GitHubClient);
  });

  describe('getMCPTools', () => {
    it('converts all five GitHub Bridge tools to PluginMCPTool definitions', () => {
      const plugin = createGitHubBridgePlugin();
      const tools = plugin.getMCPTools();

      expect(tools.map((tool) => tool.name)).toEqual([
        'github_repo_analyze',
        'github_pr_manage',
        'github_issue_track',
        'github_workflow',
        'github_metrics',
      ]);

      for (const tool of tools) {
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeTypeOf('object');
        expect(typeof tool.handler).toBe('function');
      }
    });
  });

  describe('end-to-end tool invocation', () => {
    it('invokes the github_metrics tool through the converted handler', async () => {
      const listContributors = vi.fn().mockResolvedValue({
        data: [{ login: 'octocat', contributions: 42, html_url: 'https://github.com/octocat' }],
      });
      const octokit = { rest: { repos: { listContributors } } } as unknown as Octokit;
      const plugin = createGitHubBridgePlugin({ octokit });

      const tools = plugin.getMCPTools();
      const metricsTool = tools.find((tool) => tool.name === 'github_metrics');
      if (!metricsTool) throw new Error('expected github_metrics tool');

      const context = createContext();
      const result = await metricsTool.handler({ owner: 'octocat', repo: 'hello-world', metric: 'contributors' }, context);

      const payload = JSON.parse(result.content[0].text);
      expect(payload.success).toBe(true);
      expect(payload.data.repository).toBe('octocat/hello-world');
      expect(payload.data.contributors).toEqual([{ login: 'octocat', contributions: 42, url: 'https://github.com/octocat' }]);
      expect(listContributors).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', per_page: 100 });
    });
  });
});
