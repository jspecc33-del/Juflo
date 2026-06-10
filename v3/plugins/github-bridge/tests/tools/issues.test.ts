import { describe, it, expect, vi } from 'vitest';
import { issueTrackTool } from '../../src/tools/issues.js';
import { GitHubErrorCode } from '../../src/errors.js';
import { createMockClient } from '../helpers/mock-client.js';

const sampleIssue = {
  number: 12,
  title: 'Bug report',
  state: 'open',
  labels: ['bug', { name: 'priority:high' }],
  assignees: [{ login: 'octocat' }],
  html_url: 'https://github.com/octocat/hello-world/issues/12',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-02T00:00:00Z',
  closed_at: null,
};

describe('issueTrackTool', () => {
  describe('list', () => {
    it('lists issues and excludes pull requests', async () => {
      const listForRepo = vi.fn().mockResolvedValue({
        data: [sampleIssue, { ...sampleIssue, number: 13, pull_request: { url: 'https://api.github.com/...' } }, { ...sampleIssue, number: 14, state: 'closed' }],
      });
      const client = createMockClient({ rest: { issues: { listForRepo } } });

      const result = await issueTrackTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'list' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      if (result.data.action !== 'list') throw new Error('expected list result');
      expect(result.data.total).toBe(2);
      expect(result.data.open).toBe(1);
      expect(result.data.issues.map((i) => i.number)).toEqual([12, 14]);
      expect(result.data.issues[0]).toMatchObject({ labels: ['bug', 'priority:high'], assignees: ['octocat'] });
      expect(listForRepo).toHaveBeenCalledWith({ owner: 'octocat', repo: 'hello-world', state: 'open', per_page: 50 });
    });
  });

  describe('create', () => {
    it('requires authentication', async () => {
      const client = createMockClient({ authenticated: false });
      const result = await issueTrackTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'create', title: 'Bug report' }, { client });

      expect(result.success).toBe(false);
      if (result.success) throw new Error('expected failure');
      expect(result.errorCode).toBe(GitHubErrorCode.AUTH_REQUIRED);
    });

    it('creates an issue', async () => {
      const create = vi.fn().mockResolvedValue({ data: sampleIssue });
      const client = createMockClient({ authenticated: true, rest: { issues: { create } } });

      const result = await issueTrackTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'create', title: 'Bug report', body: 'details', labels: ['bug'] }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toMatchObject({ action: 'created' });
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'octocat', repo: 'hello-world', title: 'Bug report', body: 'details', labels: ['bug'] }));
    });
  });

  describe('update', () => {
    it('updates an issue', async () => {
      const update = vi.fn().mockResolvedValue({ data: { ...sampleIssue, title: 'Updated title' } });
      const client = createMockClient({ authenticated: true, rest: { issues: { update } } });

      const result = await issueTrackTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'update', issueNumber: 12, title: 'Updated title' }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      if (result.data.action !== 'updated') throw new Error('expected updated result');
      expect(result.data.issue.title).toBe('Updated title');
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 12, title: 'Updated title' }));
    });
  });

  describe('close', () => {
    it('closes an issue', async () => {
      const update = vi.fn().mockResolvedValue({ data: { ...sampleIssue, state: 'closed', closed_at: '2026-01-05T00:00:00Z' } });
      const client = createMockClient({ authenticated: true, rest: { issues: { update } } });

      const result = await issueTrackTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'close', issueNumber: 12 }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      expect(result.data).toEqual({ action: 'closed', issueNumber: 12, closedAt: '2026-01-05T00:00:00Z' });
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 12, state: 'closed' }));
    });
  });

  describe('assign', () => {
    it('assigns users to an issue', async () => {
      const addAssignees = vi.fn().mockResolvedValue({ data: { ...sampleIssue, assignees: [{ login: 'octocat' }, { login: 'monalisa' }] } });
      const client = createMockClient({ authenticated: true, rest: { issues: { addAssignees } } });

      const result = await issueTrackTool.handler({ owner: 'octocat', repo: 'hello-world', action: 'assign', issueNumber: 12, assignees: ['octocat', 'monalisa'] }, { client });

      expect(result.success).toBe(true);
      if (!result.success) throw new Error('expected success');
      if (result.data.action !== 'assigned') throw new Error('expected assigned result');
      expect(result.data.issue.assignees).toEqual(['octocat', 'monalisa']);
      expect(addAssignees).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 12, assignees: ['octocat', 'monalisa'] }));
    });
  });
});
