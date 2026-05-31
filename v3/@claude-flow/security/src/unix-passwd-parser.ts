/**
 * Unix Passwd Format Parser
 *
 * Parses and validates /etc/passwd formatted data.
 * Supports security auditing of Unix user accounts.
 *
 * Format per line: username:password:uid:gid:gecos:home:shell
 *
 * @module v3/security/unix-passwd-parser
 */

/** A single entry from a /etc/passwd file. */
export interface PasswdEntry {
  username: string;
  /** Historically the password; 'x' means shadow passwords are in use. */
  password: string;
  uid: number;
  gid: number;
  /** GECOS field — typically the user's full name or description. */
  gecos: string;
  homeDir: string;
  shell: string;
  /** 1-based line number in the source file (for diagnostics). */
  lineNumber: number;
}

export interface PasswdParseError {
  lineNumber: number;
  line: string;
  message: string;
}

export interface PasswdParseResult {
  entries: PasswdEntry[];
  errors: PasswdParseError[];
}

export interface PasswdSecurityReport {
  /** Accounts with uid === 0 (root-equivalent privileges). */
  rootEquivalent: PasswdEntry[];
  /** Accounts that cannot start an interactive session (nologin/false shell). */
  noLoginAccess: PasswdEntry[];
  /** Accounts with uid < 1000 (system/service accounts). */
  systemAccounts: PasswdEntry[];
  /** Accounts with uid >= 1000 (regular users). */
  regularAccounts: PasswdEntry[];
  /** UIDs assigned to more than one account. */
  duplicateUids: Record<number, PasswdEntry[]>;
  /** Usernames that appear more than once. */
  duplicateUsernames: Record<string, PasswdEntry[]>;
  /**
   * Accounts whose password field is empty string, indicating no shadow
   * protection — the account may be accessible without a password.
   * Standard locked-account placeholders ('x', '*', '!', '!!') are not flagged.
   */
  unprotectedPasswords: PasswdEntry[];
  /** Regular accounts (uid >= 1000) that have an interactive login shell. */
  interactiveUsers: PasswdEntry[];
}

const NO_LOGIN_SHELLS = new Set([
  '/sbin/nologin',
  '/usr/sbin/nologin',
  '/bin/false',
  '/usr/bin/false',
  '/dev/null',
  'nologin',
  'false',
]);

const SYSTEM_UID_THRESHOLD = 1000;

export class UnixPasswdParserError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'UnixPasswdParserError';
  }
}

export class UnixPasswdParser {
  /**
   * Parses /etc/passwd formatted content into structured entries.
   *
   * Comment lines (starting with `#`) and blank lines are silently skipped.
   * Lines that cannot be parsed are collected in `errors`.
   *
   * @example
   * ```typescript
   * const result = UnixPasswdParser.parse(
   *   'root:x:0:0:root:/root:/bin/bash\n' +
   *   'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin'
   * );
   * console.log(result.entries[0].username); // 'root'
   * ```
   */
  static parse(content: string): PasswdParseResult {
    const entries: PasswdEntry[] = [];
    const errors: PasswdParseError[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const lineNumber = i + 1;
      const line = lines[i].trim();

      if (!line || line.startsWith('#')) {
        continue;
      }

      const fields = line.split(':');

      if (fields.length !== 7) {
        errors.push({
          lineNumber,
          line,
          message: `Expected 7 colon-separated fields, got ${fields.length}`,
        });
        continue;
      }

      const [username, password, uidStr, gidStr, gecos, homeDir, shell] = fields;

      if (!username) {
        errors.push({ lineNumber, line, message: 'Username cannot be empty' });
        continue;
      }

      const uid = parseInt(uidStr, 10);
      if (isNaN(uid) || uid < 0 || String(uid) !== uidStr) {
        errors.push({ lineNumber, line, message: `Invalid UID: '${uidStr}'` });
        continue;
      }

      const gid = parseInt(gidStr, 10);
      if (isNaN(gid) || gid < 0 || String(gid) !== gidStr) {
        errors.push({ lineNumber, line, message: `Invalid GID: '${gidStr}'` });
        continue;
      }

      entries.push({
        username,
        password,
        uid,
        gid,
        gecos,
        homeDir,
        shell,
        lineNumber,
      });
    }

    return { entries, errors };
  }

  /**
   * Returns `true` when the entry represents a system/service account
   * (uid is below the conventional threshold of 1000).
   */
  static isSystemAccount(entry: PasswdEntry): boolean {
    return entry.uid < SYSTEM_UID_THRESHOLD;
  }

  /**
   * Returns `true` when the account's shell allows interactive logins.
   * Accounts with shells like `/sbin/nologin` or `/bin/false` cannot log in.
   */
  static hasLoginAccess(entry: PasswdEntry): boolean {
    return !NO_LOGIN_SHELLS.has(entry.shell);
  }

  /**
   * Serialises a `PasswdEntry` back to the standard passwd-file format.
   *
   * @example
   * ```typescript
   * const line = UnixPasswdParser.format(entry);
   * // 'root:x:0:0:root:/root:/bin/bash'
   * ```
   */
  static format(entry: PasswdEntry): string {
    return [
      entry.username,
      entry.password,
      String(entry.uid),
      String(entry.gid),
      entry.gecos,
      entry.homeDir,
      entry.shell,
    ].join(':');
  }

  /**
   * Produces a security report for the provided entries, highlighting
   * potentially dangerous configurations.
   *
   * @example
   * ```typescript
   * const { entries } = UnixPasswdParser.parse(content);
   * const report = UnixPasswdParser.audit(entries);
   * if (Object.keys(report.duplicateUids).length > 0) {
   *   console.warn('Duplicate UIDs detected', report.duplicateUids);
   * }
   * ```
   */
  static audit(entries: PasswdEntry[]): PasswdSecurityReport {
    const rootEquivalent: PasswdEntry[] = [];
    const noLoginAccess: PasswdEntry[] = [];
    const systemAccounts: PasswdEntry[] = [];
    const regularAccounts: PasswdEntry[] = [];
    const unprotectedPasswords: PasswdEntry[] = [];
    const interactiveUsers: PasswdEntry[] = [];

    const uidMap = new Map<number, PasswdEntry[]>();
    const usernameMap = new Map<string, PasswdEntry[]>();

    for (const entry of entries) {
      if (entry.uid === 0) {
        rootEquivalent.push(entry);
      }

      if (!UnixPasswdParser.hasLoginAccess(entry)) {
        noLoginAccess.push(entry);
      }

      if (UnixPasswdParser.isSystemAccount(entry)) {
        systemAccounts.push(entry);
      } else {
        regularAccounts.push(entry);
      }

      // An empty password field means no password protection at all.
      // Standard locked/shadow placeholders ('x', '*', '!', '!!') are not flagged.
      if (entry.password === '') {
        unprotectedPasswords.push(entry);
      }

      if (!UnixPasswdParser.isSystemAccount(entry) && UnixPasswdParser.hasLoginAccess(entry)) {
        interactiveUsers.push(entry);
      }

      const uidGroup = uidMap.get(entry.uid) ?? [];
      uidGroup.push(entry);
      uidMap.set(entry.uid, uidGroup);

      const usernameGroup = usernameMap.get(entry.username) ?? [];
      usernameGroup.push(entry);
      usernameMap.set(entry.username, usernameGroup);
    }

    const duplicateUids: Record<number, PasswdEntry[]> = {};
    for (const [uid, group] of uidMap.entries()) {
      if (group.length > 1) {
        duplicateUids[uid] = group;
      }
    }

    const duplicateUsernames: Record<string, PasswdEntry[]> = {};
    for (const [username, group] of usernameMap.entries()) {
      if (group.length > 1) {
        duplicateUsernames[username] = group;
      }
    }

    return {
      rootEquivalent,
      noLoginAccess,
      systemAccounts,
      regularAccounts,
      duplicateUids,
      duplicateUsernames,
      unprotectedPasswords,
      interactiveUsers,
    };
  }
}
