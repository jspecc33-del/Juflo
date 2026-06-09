/**
 * Session Repository - Interface + In-Memory Implementation
 *
 * @module v3/cli/core/domains/session-management
 */

import { Session, SessionStatus } from '../entities/session.entity.js';
import { SessionId } from '../value-objects/session-id.vo.js';

// ── Interface ─────────────────────────────────────────────────────────

export interface ISessionRepository {
  save(session: Session): Promise<void>;
  findById(id: SessionId): Promise<Session | null>;
  findByName(name: string): Promise<Session | null>;
  findByStatus(status: SessionStatus): Promise<Session[]>;
  findActive(): Promise<Session[]>;
  delete(id: SessionId): Promise<boolean>;
  exists(id: SessionId): Promise<boolean>;
  count(): Promise<number>;
}

// ── In-Memory Implementation ──────────────────────────────────────────

export class InMemorySessionRepository implements ISessionRepository {
  private sessions = new Map<string, Session>();

  async save(session: Session): Promise<void> {
    this.sessions.set(session.id.value, session);
  }

  async findById(id: SessionId): Promise<Session | null> {
    return this.sessions.get(id.value) ?? null;
  }

  async findByName(name: string): Promise<Session | null> {
    for (const session of this.sessions.values()) {
      if (session.name === name) return session;
    }
    return null;
  }

  async findByStatus(status: SessionStatus): Promise<Session[]> {
    return Array.from(this.sessions.values()).filter((s) => s.status === status);
  }

  async findActive(): Promise<Session[]> {
    return this.findByStatus('active');
  }

  async delete(id: SessionId): Promise<boolean> {
    return this.sessions.delete(id.value);
  }

  async exists(id: SessionId): Promise<boolean> {
    return this.sessions.has(id.value);
  }

  async count(): Promise<number> {
    return this.sessions.size;
  }

  async clear(): Promise<void> {
    this.sessions.clear();
  }
}
