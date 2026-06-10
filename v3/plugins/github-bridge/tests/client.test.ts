import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GitHubClient, createGitHubClient } from '../src/client.js';
import { GitHubBridgeError, GitHubErrorCode } from '../src/errors.js';
import { octokitError } from './helpers/mock-client.js';

describe('GitHubClient', () => {
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalGhToken = process.env.GH_TOKEN;

  beforeEach(() => {
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  afterEach(() => {
    if (originalGithubToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalGithubToken;
    if (originalGhToken === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = originalGhToken;
  });

  describe('isAuthenticated', () => {
    it('is false with no token configured', () => {
      const client = new GitHubClient();
      expect(client.isAuthenticated()).toBe(false);
    });

    it('is true when a token is passed explicitly', () => {
      const client = new GitHubClient({ token: 'ghp_explicit' });
      expect(client.isAuthenticated()).toBe(true);
    });

    it('is true when GITHUB_TOKEN is set', () => {
      process.env.GITHUB_TOKEN = 'ghp_from_env';
      const client = new GitHubClient();
      expect(client.isAuthenticated()).toBe(true);
    });

    it('is true when GH_TOKEN is set', () => {
      process.env.GH_TOKEN = 'ghp_from_env';
      const client = new GitHubClient();
      expect(client.isAuthenticated()).toBe(true);
    });
  });

  describe('resolveRepo', () => {
    it('returns owner/repo from input when provided', () => {
      const client = new GitHubClient();
      expect(client.resolveRepo({ owner: 'octocat', repo: 'hello-world' })).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('falls back to configured defaults', () => {
      const client = new GitHubClient({ defaultOwner: 'octocat', defaultRepo: 'hello-world' });
      expect(client.resolveRepo({})).toEqual({ owner: 'octocat', repo: 'hello-world' });
    });

    it('lets explicit input override defaults', () => {
      const client = new GitHubClient({ defaultOwner: 'octocat', defaultRepo: 'hello-world' });
      expect(client.resolveRepo({ repo: 'other-repo' })).toEqual({ owner: 'octocat', repo: 'other-repo' });
    });

    it('throws VALIDATION_FAILED when owner/repo cannot be resolved', () => {
      const client = new GitHubClient();
      try {
        client.resolveRepo({});
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubBridgeError);
        expect((error as GitHubBridgeError).code).toBe(GitHubErrorCode.VALIDATION_FAILED);
      }
    });
  });

  describe('requireAuth', () => {
    it('throws AUTH_REQUIRED when not authenticated', () => {
      const client = new GitHubClient();
      try {
        client.requireAuth('create a pull request');
        expect.unreachable();
      } catch (error) {
        expect(error).toBeInstanceOf(GitHubBridgeError);
        expect((error as GitHubBridgeError).code).toBe(GitHubErrorCode.AUTH_REQUIRED);
        expect((error as GitHubBridgeError).message).toContain('create a pull request');
      }
    });

    it('does nothing when authenticated', () => {
      const client = new GitHubClient({ token: 'ghp_explicit' });
      expect(() => client.requireAuth('create a pull request')).not.toThrow();
    });
  });

  describe('execute', () => {
    it('returns the operation result on success', async () => {
      const client = new GitHubClient();
      await expect(client.execute('doing something', async () => 'ok')).resolves.toBe('ok');
    });

    it('wraps thrown errors via wrapOctokitError', async () => {
      const client = new GitHubClient();
      await expect(
        client.execute('fetching repo', async () => {
          throw octokitError(404, 'Not Found');
        }),
      ).rejects.toMatchObject({ code: GitHubErrorCode.NOT_FOUND });
    });
  });

  describe('createGitHubClient', () => {
    it('constructs a GitHubClient instance', () => {
      expect(createGitHubClient()).toBeInstanceOf(GitHubClient);
    });

    it('accepts an injected octokit instance', () => {
      const fakeOctokit = { rest: {} } as never;
      const client = new GitHubClient({ octokit: fakeOctokit, token: 'ghp_explicit' });
      expect(client.octokit).toBe(fakeOctokit);
    });
  });
});
