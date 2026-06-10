import { describe, it, expect } from 'vitest';
import {
  OwnerSchema,
  RepoNameSchema,
  BranchNameSchema,
  PRManageInputSchema,
  IssueTrackInputSchema,
  WorkflowInputSchema,
} from '../src/validators.js';

describe('OwnerSchema', () => {
  it('accepts valid GitHub owner names', () => {
    expect(OwnerSchema.safeParse('octocat').success).toBe(true);
    expect(OwnerSchema.safeParse('my-org-123').success).toBe(true);
  });

  it('rejects empty, leading/trailing hyphens, and overly long names', () => {
    expect(OwnerSchema.safeParse('').success).toBe(false);
    expect(OwnerSchema.safeParse('-leading').success).toBe(false);
    expect(OwnerSchema.safeParse('trailing-').success).toBe(false);
    expect(OwnerSchema.safeParse('a'.repeat(40)).success).toBe(false);
  });
});

describe('RepoNameSchema', () => {
  it('accepts valid repository names', () => {
    expect(RepoNameSchema.safeParse('my-repo.name_1').success).toBe(true);
  });

  it('rejects names with path separators or empty strings', () => {
    expect(RepoNameSchema.safeParse('').success).toBe(false);
    expect(RepoNameSchema.safeParse('foo/bar').success).toBe(false);
  });
});

describe('BranchNameSchema', () => {
  it('accepts simple and namespaced branch names', () => {
    expect(BranchNameSchema.safeParse('main').success).toBe(true);
    expect(BranchNameSchema.safeParse('feature/foo').success).toBe(true);
  });

  it('rejects refs with double dots, spaces, leading/trailing slashes, or .lock suffix', () => {
    expect(BranchNameSchema.safeParse('').success).toBe(false);
    expect(BranchNameSchema.safeParse('foo..bar').success).toBe(false);
    expect(BranchNameSchema.safeParse('foo bar').success).toBe(false);
    expect(BranchNameSchema.safeParse('/leading').success).toBe(false);
    expect(BranchNameSchema.safeParse('trailing/').success).toBe(false);
    expect(BranchNameSchema.safeParse('branch.lock').success).toBe(false);
  });
});

describe('PRManageInputSchema', () => {
  it('requires prNumber for review/merge/close actions', () => {
    expect(PRManageInputSchema.safeParse({ action: 'review' }).success).toBe(false);
    expect(PRManageInputSchema.safeParse({ action: 'merge' }).success).toBe(false);
    expect(PRManageInputSchema.safeParse({ action: 'close' }).success).toBe(false);
    expect(PRManageInputSchema.safeParse({ action: 'merge', prNumber: 1 }).success).toBe(true);
  });

  it('requires title and branch for create', () => {
    expect(PRManageInputSchema.safeParse({ action: 'create' }).success).toBe(false);
    expect(PRManageInputSchema.safeParse({ action: 'create', title: 'My PR' }).success).toBe(false);
    expect(PRManageInputSchema.safeParse({ action: 'create', title: 'My PR', branch: 'feature/foo' }).success).toBe(true);
  });

  it('does not require prNumber for list', () => {
    expect(PRManageInputSchema.safeParse({ action: 'list' }).success).toBe(true);
  });
});

describe('IssueTrackInputSchema', () => {
  it('requires issueNumber for update/close/assign actions', () => {
    expect(IssueTrackInputSchema.safeParse({ action: 'update' }).success).toBe(false);
    expect(IssueTrackInputSchema.safeParse({ action: 'close' }).success).toBe(false);
    expect(IssueTrackInputSchema.safeParse({ action: 'update', issueNumber: 1, title: 'fix' }).success).toBe(true);
  });

  it('requires title for create', () => {
    expect(IssueTrackInputSchema.safeParse({ action: 'create' }).success).toBe(false);
    expect(IssueTrackInputSchema.safeParse({ action: 'create', title: 'Bug report' }).success).toBe(true);
  });

  it('requires non-empty assignees for assign', () => {
    expect(IssueTrackInputSchema.safeParse({ action: 'assign', issueNumber: 1 }).success).toBe(false);
    expect(IssueTrackInputSchema.safeParse({ action: 'assign', issueNumber: 1, assignees: [] }).success).toBe(false);
    expect(IssueTrackInputSchema.safeParse({ action: 'assign', issueNumber: 1, assignees: ['octocat'] }).success).toBe(true);
  });

  it('does not require issueNumber for list', () => {
    expect(IssueTrackInputSchema.safeParse({ action: 'list' }).success).toBe(true);
  });
});

describe('WorkflowInputSchema', () => {
  it('requires workflowId for trigger and status actions', () => {
    expect(WorkflowInputSchema.safeParse({ action: 'trigger' }).success).toBe(false);
    expect(WorkflowInputSchema.safeParse({ action: 'status' }).success).toBe(false);
    expect(WorkflowInputSchema.safeParse({ action: 'trigger', workflowId: 'ci.yml' }).success).toBe(true);
    expect(WorkflowInputSchema.safeParse({ action: 'status', workflowId: 123 }).success).toBe(true);
  });

  it('does not require workflowId for list and cancel', () => {
    expect(WorkflowInputSchema.safeParse({ action: 'list' }).success).toBe(true);
    expect(WorkflowInputSchema.safeParse({ action: 'cancel' }).success).toBe(true);
    expect(WorkflowInputSchema.safeParse({ action: 'cancel', runId: 42 }).success).toBe(true);
  });
});
