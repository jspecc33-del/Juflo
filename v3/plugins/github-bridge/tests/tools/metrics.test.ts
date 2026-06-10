import { describe, it, expect, vi } from 'vitest';
import { metricsTool } from '../../src/tools/metrics.js';
import { createMockClient, octokitError } from '../helpers/mock-client.js';

function buildRest(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    repos: {
      getCommitActivityStats: vi.fn().mockResolvedValue({ status: 200, data: [{ week: 0, total: 5, days: [0, 1, 1, 1, 1, 1, 0] }, { week: 1, total: 3, days: [0, 0, 1, 1, 1, 0, 0] }] }),
      listContributors: vi.fn().mockResolvedValue({ data: [{ login: 'octocat', contributions: 42, html_url: 'https://github.com/octocat' }, { login: null }] }),
      getViews: vi.fn().mockResolvedValue({ data: { count: 100, uniques: 10 } }),
      getClones: vi.fn().mockResolvedValue({ data: { count: 20, uniques: 5 } }),
      listReleases: vi.fn().mockResolvedValue({
        data: [{ id: 1, tag_name: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false, published_at: '2026-01-01T00:00:00Z', html_url: 'https://github.com/octocat/hello-world/releases/v1.0.0' }],
      }),
      ...overrides.repos,
    },
  };
}

describe('metricsTool', () => {
  it('fetches all metrics by default', async () => {
    const rest = buildRest();
    const client = createMockClient({ rest });

    const result = await metricsTool.handler({ owner: 'octocat', repo: 'hello-world' }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.repository).toBe('octocat/hello-world');
    expect(result.data.metric).toBe('all');
    expect(result.data.commits).toEqual({ totalCommitsLastYear: 8, weeks: [{ week: 0, total: 5, days: [0, 1, 1, 1, 1, 1, 0] }, { week: 1, total: 3, days: [0, 0, 1, 1, 1, 0, 0] }] });
    expect(result.data.contributors).toEqual([{ login: 'octocat', contributions: 42, url: 'https://github.com/octocat' }]);
    expect(result.data.traffic).toEqual({ views: { count: 100, uniques: 10 }, clones: { count: 20, uniques: 5 } });
    expect(result.data.releases).toEqual([{ id: 1, tagName: 'v1.0.0', name: 'v1.0.0', draft: false, prerelease: false, publishedAt: '2026-01-01T00:00:00Z', url: 'https://github.com/octocat/hello-world/releases/v1.0.0' }]);
  });

  it('fetches only the requested metric', async () => {
    const rest = buildRest();
    const client = createMockClient({ rest });

    const result = await metricsTool.handler({ owner: 'octocat', repo: 'hello-world', metric: 'contributors' }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.contributors).toBeDefined();
    expect(result.data.commits).toBeUndefined();
    expect(result.data.traffic).toBeUndefined();
    expect(result.data.releases).toBeUndefined();
    expect(rest.repos.getCommitActivityStats).not.toHaveBeenCalled();
  });

  it('returns an empty commit activity object when GitHub responds with 202', async () => {
    const rest = buildRest({ repos: { getCommitActivityStats: vi.fn().mockResolvedValue({ status: 202, data: [] }) } });
    const client = createMockClient({ rest });

    const result = await metricsTool.handler({ owner: 'octocat', repo: 'hello-world', metric: 'commits' }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.commits).toEqual({});
  });

  it('degrades traffic to an empty object when access is forbidden', async () => {
    const rest = buildRest({ repos: { getViews: vi.fn().mockRejectedValue(octokitError(403, 'Forbidden')), getClones: vi.fn().mockResolvedValue({ data: { count: 0, uniques: 0 } }) } });
    const client = createMockClient({ rest });

    const result = await metricsTool.handler({ owner: 'octocat', repo: 'hello-world', metric: 'traffic' }, { client });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('expected success');
    expect(result.data.traffic).toEqual({});
  });

  it('propagates non-permission errors from traffic fetching', async () => {
    const rest = buildRest({ repos: { getViews: vi.fn().mockRejectedValue(octokitError(500, 'Internal Server Error')), getClones: vi.fn().mockResolvedValue({ data: { count: 0, uniques: 0 } }) } });
    const client = createMockClient({ rest });

    const result = await metricsTool.handler({ owner: 'octocat', repo: 'hello-world', metric: 'traffic' }, { client });

    expect(result.success).toBe(false);
  });
});
