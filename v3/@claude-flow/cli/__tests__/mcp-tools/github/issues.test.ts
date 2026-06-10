/**
 * Tests for github_issue_track (src/mcp-tools/github/issues.ts) online mode.
 *
 * Mocks @octokit/rest so resolveGitHubContext() takes the online branch
 * (GITHUB_TOKEN set + owner/repo provided), then asserts the handler maps
 * Octokit responses into the expected result shape for list/create/update/
 * close/assign, plus error handling.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOctokitMock, type OctokitMock } from './octokit-mock.js';

let octokitMock: OctokitMock;

vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(function (this: unknown) {
    return octokitMock;
  }),
}));

import { issueTrackTool } from '../../../src/mcp-tools/github/issues.js';

const OWNER = 'octo-org';
const REPO = 'octo-repo';

function baseIssue(overrides: Record<string, unknown> = {}) {
  return {
    number: 10,
    title: 'Bug report',
    state: 'open',
    labels: [{ name: 'bug' }, 'priority:high'],
    assignees: [{ login: 'alice' }],
    html_url: `https://github.com/${OWNER}/${REPO}/issues/10`,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    closed_at: null,
    ...overrides,
  };
}

describe('github_issue_track (online)', () => {
  beforeEach(() => {
    octokitMock = createOctokitMock();
    process.env.GITHUB_TOKEN = 'test-token';
  });

  afterEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    vi.clearAllMocks();
  });

  describe('list action', () => {
    it('lists issues, maps labels/assignees, and excludes pull requests', async () => {
      octokitMock.issues.listForRepo.mockResolvedValue({
        data: [
          baseIssue(),
          baseIssue({ number: 11, title: 'Closed issue', state: 'closed', closed_at: '2026-01-05T00:00:00Z' }),
          { ...baseIssue({ number: 12, title: 'A PR' }), pull_request: { url: 'https://api.github.com/...' } },
        ],
      });

      const result: any = await issueTrackTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(octokitMock.issues.listForRepo).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        state: 'open',
        labels: undefined,
        per_page: 100,
      });
      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.open).toBe(1);
      expect(result.issues[0]).toMatchObject({
        number: 10,
        title: 'Bug report',
        state: 'open',
        labels: ['bug', 'priority:high'],
        assignees: ['alice'],
        url: `https://github.com/${OWNER}/${REPO}/issues/10`,
        closedAt: null,
      });
      expect(result.issues[1]).toMatchObject({ number: 11, state: 'closed', closedAt: '2026-01-05T00:00:00Z' });
    });

    it('passes a joined labels filter and explicit state', async () => {
      octokitMock.issues.listForRepo.mockResolvedValue({ data: [] });

      await issueTrackTool.handler({ action: 'list', owner: OWNER, repo: REPO, state: 'all', labels: ['bug', 'urgent'] });

      expect(octokitMock.issues.listForRepo).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        state: 'all',
        labels: 'bug,urgent',
        per_page: 100,
      });
    });

    it('handles issues with no assignees', async () => {
      octokitMock.issues.listForRepo.mockResolvedValue({ data: [baseIssue({ assignees: null })] });

      const result: any = await issueTrackTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(result.issues[0].assignees).toEqual([]);
    });
  });

  describe('create action', () => {
    it('creates an issue and returns the summary', async () => {
      octokitMock.issues.create.mockResolvedValue({ data: baseIssue({ title: 'New issue', labels: ['feature'] }) });

      const result: any = await issueTrackTool.handler({
        action: 'create',
        owner: OWNER,
        repo: REPO,
        title: 'New issue',
        body: 'Description',
        labels: ['feature'],
        assignees: ['alice'],
      });

      expect(octokitMock.issues.create).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        title: 'New issue',
        body: 'Description',
        labels: ['feature'],
        assignees: ['alice'],
      });
      expect(result.success).toBe(true);
      expect(result.action).toBe('created');
      expect(result.issue).toMatchObject({ number: 10, title: 'New issue', labels: ['feature'] });
    });

    it('returns an error when title is missing', async () => {
      const result: any = await issueTrackTool.handler({ action: 'create', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('title is required');
      expect(octokitMock.issues.create).not.toHaveBeenCalled();
    });
  });

  describe('update action', () => {
    it('updates an issue title/body/labels', async () => {
      octokitMock.issues.update.mockResolvedValue({ data: {} });

      const result: any = await issueTrackTool.handler({
        action: 'update',
        owner: OWNER,
        repo: REPO,
        issueNumber: 10,
        title: 'Updated title',
        body: 'Updated body',
        labels: ['bug', 'p1'],
      });

      expect(octokitMock.issues.update).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        issue_number: 10,
        title: 'Updated title',
        body: 'Updated body',
        labels: ['bug', 'p1'],
      });
      expect(result).toEqual({ success: true, action: 'updated', issueNumber: 10 });
    });

    it('returns an error when issueNumber is missing', async () => {
      const result: any = await issueTrackTool.handler({ action: 'update', owner: OWNER, repo: REPO, title: 'X' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('issueNumber is required for update action');
      expect(octokitMock.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('close action', () => {
    it('closes an issue via issues.update with state closed', async () => {
      octokitMock.issues.update.mockResolvedValue({ data: {} });

      const result: any = await issueTrackTool.handler({ action: 'close', owner: OWNER, repo: REPO, issueNumber: 10 });

      expect(octokitMock.issues.update).toHaveBeenCalledWith({ owner: OWNER, repo: REPO, issue_number: 10, state: 'closed' });
      expect(result.success).toBe(true);
      expect(result.action).toBe('closed');
      expect(result.issueNumber).toBe(10);
      expect(typeof result.closedAt).toBe('string');
    });

    it('returns an error when issueNumber is missing', async () => {
      const result: any = await issueTrackTool.handler({ action: 'close', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(result.error).toContain('issueNumber is required for close action');
      expect(octokitMock.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('assign action', () => {
    it('assigns users to an issue and returns assignee logins', async () => {
      octokitMock.issues.addAssignees.mockResolvedValue({ data: { assignees: [{ login: 'alice' }, { login: 'bob' }] } });

      const result: any = await issueTrackTool.handler({
        action: 'assign',
        owner: OWNER,
        repo: REPO,
        issueNumber: 10,
        assignees: ['alice', 'bob'],
      });

      expect(octokitMock.issues.addAssignees).toHaveBeenCalledWith({
        owner: OWNER,
        repo: REPO,
        issue_number: 10,
        assignees: ['alice', 'bob'],
      });
      expect(result).toEqual({ success: true, action: 'assigned', issueNumber: 10, assignees: ['alice', 'bob'] });
    });

    it('falls back to the input assignees when response omits them', async () => {
      octokitMock.issues.addAssignees.mockResolvedValue({ data: {} });

      const result: any = await issueTrackTool.handler({
        action: 'assign',
        owner: OWNER,
        repo: REPO,
        issueNumber: 10,
        assignees: ['carol'],
      });

      expect(result.assignees).toEqual(['carol']);
    });

    it('returns an error when issueNumber or assignees are missing', async () => {
      const noNumber: any = await issueTrackTool.handler({ action: 'assign', owner: OWNER, repo: REPO, assignees: ['alice'] });
      const noAssignees: any = await issueTrackTool.handler({ action: 'assign', owner: OWNER, repo: REPO, issueNumber: 10, assignees: [] });

      expect(noNumber.success).toBe(false);
      expect(noNumber.error).toContain('issueNumber and assignees are required');
      expect(noAssignees.success).toBe(false);
      expect(octokitMock.issues.addAssignees).not.toHaveBeenCalled();
    });
  });

  describe('unknown action', () => {
    it('returns an error for an unrecognized action', async () => {
      const result: any = await issueTrackTool.handler({ action: 'frobnicate', owner: OWNER, repo: REPO });

      expect(result).toEqual({ success: false, error: 'Unknown action' });
    });
  });

  describe('error handling', () => {
    it('returns formatGitHubError result on Octokit rejection during list', async () => {
      octokitMock.issues.listForRepo.mockRejectedValue({ status: 404, message: 'Not Found' });

      const result: any = await issueTrackTool.handler({ action: 'list', owner: OWNER, repo: REPO });

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error).toContain('Not Found');
    });

    it('returns formatGitHubError result on Octokit rejection during create', async () => {
      octokitMock.issues.create.mockRejectedValue({ status: 422, message: 'Validation Failed' });

      const result: any = await issueTrackTool.handler({ action: 'create', owner: OWNER, repo: REPO, title: 'New' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation Failed');
    });
  });
});
