import { describe, it, expect } from 'vitest';
import { GitHubBridgeError, GitHubErrorCode, wrapOctokitError, toToolError, ValidationError } from '../src/errors.js';
import { octokitError } from './helpers/mock-client.js';

describe('wrapOctokitError', () => {
  it('returns the same error if already a GitHubBridgeError', () => {
    const original = new GitHubBridgeError('boom', GitHubErrorCode.NOT_FOUND);
    expect(wrapOctokitError(original, 'doing something')).toBe(original);
  });

  it('maps 401 to UNAUTHORIZED', () => {
    const err = wrapOctokitError(octokitError(401, 'Bad credentials'), 'fetching repo');
    expect(err.code).toBe(GitHubErrorCode.UNAUTHORIZED);
    expect(err.status).toBe(401);
    expect(err.message).toContain('fetching repo');
  });

  it('maps 403 with exhausted rate limit to RATE_LIMITED', () => {
    const err = wrapOctokitError(octokitError(403, 'API rate limit exceeded', { 'x-ratelimit-remaining': '0' }), 'listing repos');
    expect(err.code).toBe(GitHubErrorCode.RATE_LIMITED);
  });

  it('maps a plain 403 to FORBIDDEN', () => {
    const err = wrapOctokitError(octokitError(403, 'Forbidden'), 'fetching traffic');
    expect(err.code).toBe(GitHubErrorCode.FORBIDDEN);
  });

  it('maps 404 to NOT_FOUND', () => {
    const err = wrapOctokitError(octokitError(404, 'Not Found'), 'fetching repo');
    expect(err.code).toBe(GitHubErrorCode.NOT_FOUND);
  });

  it('maps 409 to CONFLICT', () => {
    const err = wrapOctokitError(octokitError(409, 'Merge conflict'), 'merging pull request');
    expect(err.code).toBe(GitHubErrorCode.CONFLICT);
  });

  it('maps 422 to UNPROCESSABLE', () => {
    const err = wrapOctokitError(octokitError(422, 'Validation failed'), 'creating issue');
    expect(err.code).toBe(GitHubErrorCode.UNPROCESSABLE);
  });

  it('maps unknown statuses to API_ERROR', () => {
    const err = wrapOctokitError(octokitError(500, 'Internal Server Error'), 'fetching repo');
    expect(err.code).toBe(GitHubErrorCode.API_ERROR);
    expect(err.status).toBe(500);
  });

  it('maps non-Octokit errors to UNKNOWN', () => {
    const err = wrapOctokitError(new Error('boom'), 'doing something');
    expect(err.code).toBe(GitHubErrorCode.UNKNOWN);
    expect(err.message).toContain('boom');
  });

  it('handles non-Error thrown values', () => {
    const err = wrapOctokitError('a string error', 'doing something');
    expect(err.code).toBe(GitHubErrorCode.UNKNOWN);
    expect(err.message).toContain('a string error');
  });
});

describe('toToolError', () => {
  it('converts a GitHubBridgeError into a failure result', () => {
    const result = toToolError(new ValidationError('owner is required'));
    expect(result).toEqual({ success: false, error: 'owner is required', errorCode: GitHubErrorCode.VALIDATION_FAILED });
  });

  it('wraps unexpected errors before converting', () => {
    const result = toToolError(octokitError(404, 'Not Found'));
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(GitHubErrorCode.NOT_FOUND);
  });
});
