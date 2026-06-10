/**
 * GitHub Bridge Plugin - Input Validators
 *
 * Zod schemas for the GitHub Bridge MCP tools. Owner/repo/branch identifiers
 * are constrained to the character sets GitHub itself allows, which also
 * rules out path traversal and injection payloads before they reach Octokit.
 *
 * @module github-bridge/validators
 * @version 0.1.0
 */

import { z } from 'zod';

// ============================================================================
// Primitive Schemas
// ============================================================================

/** GitHub login/org names: alphanumeric or hyphen, 1-39 chars, no leading/trailing hyphen. */
export const OwnerSchema = z
  .string()
  .min(1, 'owner is required')
  .max(39, 'owner exceeds GitHub username length limit')
  .regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/, 'owner must be a valid GitHub user/org name');

/** GitHub repository names: alphanumeric, dot, hyphen, underscore, 1-100 chars. */
export const RepoNameSchema = z
  .string()
  .min(1, 'repo is required')
  .max(100, 'repo exceeds GitHub repository name length limit')
  .regex(/^[a-zA-Z0-9._-]+$/, 'repo must contain only letters, digits, "." "_" "-"');

/** Branch / ref names: disallow whitespace, control chars and ".." segments per git's refname rules. */
export const BranchNameSchema = z
  .string()
  .min(1, 'branch name is required')
  .max(255, 'branch name is too long')
  .regex(/^(?!\/|.*\.\.|.*[\x00-\x1f\x7f~^:?*\[\\ ]|.*\/$|.*\.lock$)[\x21-\x7e]+$/, 'branch name contains invalid characters');

/** Positive integer issue/PR/run identifiers. */
export const PositiveIntSchema = z.number().int().positive();

/** Free-form labels/assignee logins - bounded length, no control characters. */
export const SafeStringSchema = z
  .string()
  .max(256, 'value is too long')
  .regex(/^[^\x00-\x1f\x7f]*$/, 'value contains control characters');

export const LabelsSchema = z.array(SafeStringSchema).max(50, 'too many labels').optional();
export const AssigneesSchema = z.array(SafeStringSchema).max(50, 'too many assignees').optional();

/** Repository identifier shared by every tool. */
export const RepoRefSchema = z.object({
  owner: OwnerSchema.optional(),
  repo: RepoNameSchema.optional(),
});

// ============================================================================
// Tool Input Schemas
// ============================================================================

export const RepoAnalyzeInputSchema = RepoRefSchema.extend({
  branch: BranchNameSchema.optional(),
  deep: z.boolean().optional(),
});
export type RepoAnalyzeInput = z.infer<typeof RepoAnalyzeInputSchema>;

export const PRManageInputSchema = RepoRefSchema.extend({
  action: z.enum(['list', 'create', 'review', 'merge', 'close']),
  state: z.enum(['open', 'closed', 'all']).optional(),
  prNumber: PositiveIntSchema.optional(),
  title: z.string().max(256).optional(),
  body: z.string().max(65536).optional(),
  branch: BranchNameSchema.optional(),
  baseBranch: BranchNameSchema.optional(),
  draft: z.boolean().optional(),
  reviewEvent: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']).optional(),
  mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
}).superRefine((value, ctx) => {
  if (['review', 'merge', 'close'].includes(value.action) && value.prNumber === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `prNumber is required for action "${value.action}"`, path: ['prNumber'] });
  }
  if (value.action === 'create' && (!value.title || !value.branch)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'title and branch are required for action "create"', path: ['title'] });
  }
});
export type PRManageInput = z.infer<typeof PRManageInputSchema>;

export const IssueTrackInputSchema = RepoRefSchema.extend({
  action: z.enum(['list', 'create', 'update', 'close', 'assign']),
  state: z.enum(['open', 'closed', 'all']).optional(),
  issueNumber: PositiveIntSchema.optional(),
  title: z.string().max(256).optional(),
  body: z.string().max(65536).optional(),
  labels: LabelsSchema,
  assignees: AssigneesSchema,
}).superRefine((value, ctx) => {
  if (['update', 'close', 'assign'].includes(value.action) && value.issueNumber === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `issueNumber is required for action "${value.action}"`, path: ['issueNumber'] });
  }
  if (value.action === 'create' && !value.title) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'title is required for action "create"', path: ['title'] });
  }
  if (value.action === 'assign' && (!value.assignees || value.assignees.length === 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'assignees is required for action "assign"', path: ['assignees'] });
  }
});
export type IssueTrackInput = z.infer<typeof IssueTrackInputSchema>;

export const WorkflowInputSchema = RepoRefSchema.extend({
  action: z.enum(['list', 'trigger', 'status', 'cancel']),
  workflowId: z.union([z.string().max(256), PositiveIntSchema]).optional(),
  ref: BranchNameSchema.optional(),
  runId: PositiveIntSchema.optional(),
  inputs: z.record(z.string(), z.string()).optional(),
}).superRefine((value, ctx) => {
  if (['trigger', 'status'].includes(value.action) && value.workflowId === undefined) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `workflowId is required for action "${value.action}"`, path: ['workflowId'] });
  }
});
export type WorkflowInput = z.infer<typeof WorkflowInputSchema>;

export const MetricsInputSchema = RepoRefSchema.extend({
  metric: z.enum(['all', 'commits', 'contributors', 'traffic', 'releases']).optional(),
});
export type MetricsInput = z.infer<typeof MetricsInputSchema>;
