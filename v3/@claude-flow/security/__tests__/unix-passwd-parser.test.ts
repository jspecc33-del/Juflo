/**
 * Unix Passwd Parser Tests
 *
 * Tests verify:
 * - Correct parsing of well-formed /etc/passwd content
 * - Graceful handling of malformed lines
 * - Security report (audit) accuracy
 * - Format round-trip correctness
 * - Helper predicates (isSystemAccount, hasLoginAccess)
 */

import { describe, it, expect } from 'vitest';
import {
  UnixPasswdParser,
  UnixPasswdParserError,
  type PasswdEntry,
} from '../src/unix-passwd-parser.js';

// Minimal sample that mirrors a typical /etc/passwd
const SAMPLE_PASSWD = [
  'root:x:0:0:root:/root:/bin/bash',
  'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin',
  'bin:x:2:2:bin:/bin:/usr/sbin/nologin',
  'nobody:x:65534:65534:nobody:/nonexistent:/usr/sbin/nologin',
  'alice:x:1000:1000:Alice Smith:/home/alice:/bin/bash',
  'bob:x:1001:1001:Bob Jones:/home/bob:/bin/zsh',
].join('\n');

describe('UnixPasswdParser', () => {
  describe('parse()', () => {
    it('parses a well-formed passwd file without errors', () => {
      const { entries, errors } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      expect(errors).toHaveLength(0);
      expect(entries).toHaveLength(6);
    });

    it('correctly populates all fields for the root entry', () => {
      const { entries } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      const root = entries[0];
      expect(root.username).toBe('root');
      expect(root.password).toBe('x');
      expect(root.uid).toBe(0);
      expect(root.gid).toBe(0);
      expect(root.gecos).toBe('root');
      expect(root.homeDir).toBe('/root');
      expect(root.shell).toBe('/bin/bash');
      expect(root.lineNumber).toBe(1);
    });

    it('records the correct 1-based line number for each entry', () => {
      const { entries } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      entries.forEach((entry, idx) => {
        expect(entry.lineNumber).toBe(idx + 1);
      });
    });

    it('skips blank lines silently', () => {
      const content = 'root:x:0:0:root:/root:/bin/bash\n\nalice:x:1000:1000:Alice:/home/alice:/bin/bash';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(errors).toHaveLength(0);
      expect(entries).toHaveLength(2);
    });

    it('skips comment lines silently', () => {
      const content = '# this is a comment\nroot:x:0:0:root:/root:/bin/bash';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(errors).toHaveLength(0);
      expect(entries).toHaveLength(1);
    });

    it('records an error for a line with too few fields', () => {
      const content = 'root:x:0:0:root:/root';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(entries).toHaveLength(0);
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/7/);
    });

    it('records an error for a line with too many fields', () => {
      const content = 'root:x:0:0:root:/root:/bin/bash:extra';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(entries).toHaveLength(0);
      expect(errors[0].message).toMatch(/7/);
    });

    it('records an error when UID is non-numeric', () => {
      const content = 'root:x:abc:0:root:/root:/bin/bash';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(entries).toHaveLength(0);
      expect(errors[0].message).toMatch(/UID/);
    });

    it('records an error when GID is non-numeric', () => {
      const content = 'root:x:0:abc:root:/root:/bin/bash';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(entries).toHaveLength(0);
      expect(errors[0].message).toMatch(/GID/);
    });

    it('records an error when username is empty', () => {
      const content = ':x:0:0:root:/root:/bin/bash';
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(entries).toHaveLength(0);
      expect(errors[0].message).toMatch(/[Uu]sername/);
    });

    it('collects errors without stopping at the first bad line', () => {
      const content = [
        'root:x:bad:0:root:/root:/bin/bash',
        'alice:x:1000:1000:Alice:/home/alice:/bin/bash',
        'bob:x:1001:bad:Bob:/home/bob:/bin/bash',
      ].join('\n');
      const { entries, errors } = UnixPasswdParser.parse(content);
      expect(entries).toHaveLength(1);
      expect(errors).toHaveLength(2);
    });

    it('handles an empty string without throwing', () => {
      const { entries, errors } = UnixPasswdParser.parse('');
      expect(entries).toHaveLength(0);
      expect(errors).toHaveLength(0);
    });

    it('handles GECOS field with commas (user info sub-fields)', () => {
      const content = 'alice:x:1000:1000:Alice Smith,Room 1,555-1234:/home/alice:/bin/bash';
      const { entries } = UnixPasswdParser.parse(content);
      expect(entries[0].gecos).toBe('Alice Smith,Room 1,555-1234');
    });
  });

  describe('isSystemAccount()', () => {
    it('returns true for uid 0 (root)', () => {
      const entry = makeEntry({ uid: 0 });
      expect(UnixPasswdParser.isSystemAccount(entry)).toBe(true);
    });

    it('returns true for uid < 1000', () => {
      expect(UnixPasswdParser.isSystemAccount(makeEntry({ uid: 1 }))).toBe(true);
      expect(UnixPasswdParser.isSystemAccount(makeEntry({ uid: 999 }))).toBe(true);
    });

    it('returns false for uid >= 1000', () => {
      expect(UnixPasswdParser.isSystemAccount(makeEntry({ uid: 1000 }))).toBe(false);
      expect(UnixPasswdParser.isSystemAccount(makeEntry({ uid: 65534 }))).toBe(false);
    });
  });

  describe('hasLoginAccess()', () => {
    const noLoginShells = [
      '/sbin/nologin',
      '/usr/sbin/nologin',
      '/bin/false',
      '/usr/bin/false',
      '/dev/null',
      'nologin',
      'false',
    ];

    it('returns false for all no-login shells', () => {
      for (const shell of noLoginShells) {
        expect(UnixPasswdParser.hasLoginAccess(makeEntry({ shell }))).toBe(false);
      }
    });

    it('returns true for interactive shells', () => {
      const loginShells = ['/bin/bash', '/bin/sh', '/bin/zsh', '/usr/bin/fish'];
      for (const shell of loginShells) {
        expect(UnixPasswdParser.hasLoginAccess(makeEntry({ shell }))).toBe(true);
      }
    });
  });

  describe('format()', () => {
    it('round-trips an entry without data loss', () => {
      const original = 'alice:x:1000:1000:Alice Smith:/home/alice:/bin/bash';
      const { entries } = UnixPasswdParser.parse(original);
      expect(UnixPasswdParser.format(entries[0])).toBe(original);
    });

    it('round-trips root without data loss', () => {
      const original = 'root:x:0:0:root:/root:/bin/bash';
      const { entries } = UnixPasswdParser.parse(original);
      expect(UnixPasswdParser.format(entries[0])).toBe(original);
    });

    it('preserves an empty GECOS field', () => {
      const original = 'svc:x:200:200::/srv/svc:/usr/sbin/nologin';
      const { entries } = UnixPasswdParser.parse(original);
      expect(UnixPasswdParser.format(entries[0])).toBe(original);
    });
  });

  describe('audit()', () => {
    it('identifies root-equivalent accounts (uid === 0)', () => {
      const { entries } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      const report = UnixPasswdParser.audit(entries);
      expect(report.rootEquivalent).toHaveLength(1);
      expect(report.rootEquivalent[0].username).toBe('root');
    });

    it('identifies accounts with no login access', () => {
      const { entries } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      const report = UnixPasswdParser.audit(entries);
      const noLoginUsernames = report.noLoginAccess.map((e) => e.username);
      expect(noLoginUsernames).toContain('daemon');
      expect(noLoginUsernames).toContain('bin');
      expect(noLoginUsernames).toContain('nobody');
      expect(noLoginUsernames).not.toContain('alice');
      expect(noLoginUsernames).not.toContain('bob');
    });

    it('separates system accounts from regular accounts', () => {
      const { entries } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      const report = UnixPasswdParser.audit(entries);
      expect(report.systemAccounts.map((e) => e.username)).toEqual(
        expect.arrayContaining(['root', 'daemon', 'bin', 'nobody']),
      );
      expect(report.regularAccounts.map((e) => e.username)).toEqual(
        expect.arrayContaining(['alice', 'bob']),
      );
    });

    it('detects duplicate UIDs', () => {
      const content = [
        'root:x:0:0:root:/root:/bin/bash',
        'toor:x:0:0:Alternative root:/root:/bin/bash',
        'alice:x:1000:1000:Alice:/home/alice:/bin/bash',
      ].join('\n');
      const { entries } = UnixPasswdParser.parse(content);
      const report = UnixPasswdParser.audit(entries);
      expect(Object.keys(report.duplicateUids)).toHaveLength(1);
      expect(report.duplicateUids[0].map((e) => e.username)).toEqual(
        expect.arrayContaining(['root', 'toor']),
      );
    });

    it('detects duplicate usernames', () => {
      const content = [
        'alice:x:1000:1000:Alice:/home/alice:/bin/bash',
        'alice:x:1001:1001:Duplicate Alice:/home/alice2:/bin/bash',
      ].join('\n');
      const { entries } = UnixPasswdParser.parse(content);
      const report = UnixPasswdParser.audit(entries);
      expect(Object.keys(report.duplicateUsernames)).toHaveLength(1);
      expect(report.duplicateUsernames['alice']).toHaveLength(2);
    });

    it('detects unprotected password fields (empty or "0")', () => {
      const content = [
        'alice:x:1000:1000:Alice:/home/alice:/bin/bash',
        'backdoor::1001:1001:No password:/home/backdoor:/bin/bash',
        'legacy:0:1002:1002:Legacy:/home/legacy:/bin/bash',
      ].join('\n');
      const { entries } = UnixPasswdParser.parse(content);
      const report = UnixPasswdParser.audit(entries);
      expect(report.unprotectedPasswords.map((e) => e.username)).toEqual(
        expect.arrayContaining(['backdoor', 'legacy']),
      );
      expect(report.unprotectedPasswords.map((e) => e.username)).not.toContain('alice');
    });

    it('lists regular interactive users (uid >= 1000 with login shell)', () => {
      const { entries } = UnixPasswdParser.parse(SAMPLE_PASSWD);
      const report = UnixPasswdParser.audit(entries);
      const names = report.interactiveUsers.map((e) => e.username);
      expect(names).toContain('alice');
      expect(names).toContain('bob');
      expect(names).not.toContain('daemon');
      expect(names).not.toContain('root');
    });

    it('returns empty collections when there are no anomalies', () => {
      const content = 'alice:x:1000:1000:Alice:/home/alice:/bin/bash';
      const { entries } = UnixPasswdParser.parse(content);
      const report = UnixPasswdParser.audit(entries);
      expect(report.rootEquivalent).toHaveLength(0);
      expect(report.duplicateUids).toEqual({});
      expect(report.duplicateUsernames).toEqual({});
      expect(report.unprotectedPasswords).toHaveLength(0);
    });

    it('handles an empty entries array without throwing', () => {
      const report = UnixPasswdParser.audit([]);
      expect(report.rootEquivalent).toHaveLength(0);
      expect(report.systemAccounts).toHaveLength(0);
      expect(report.regularAccounts).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEntry(overrides: Partial<PasswdEntry>): PasswdEntry {
  return {
    username: 'testuser',
    password: 'x',
    uid: 1000,
    gid: 1000,
    gecos: 'Test User',
    homeDir: '/home/testuser',
    shell: '/bin/bash',
    lineNumber: 1,
    ...overrides,
  };
}
