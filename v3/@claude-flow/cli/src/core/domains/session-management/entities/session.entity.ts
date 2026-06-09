/**
 * Session - Domain Entity
 *
 * Represents a Claude Flow session with lifecycle management.
 * Sessions persist agent context, task history, and memory state
 * across invocations.
 *
 * @module v3/cli/core/domains/session-management
 */

import { AggregateRoot } from '../../../shared/domain/aggregate-root.js';
import { SessionId } from '../value-objects/session-id.vo.js';

export type SessionStatus = 'active' | 'saved' | 'archived' | 'expired';

export interface SessionProps {
  id: SessionId;
  name: string;
  status: SessionStatus;
  agentIds: string[];
  taskIds: string[];
  memoryNamespace: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt?: Date;
}

export class Session extends AggregateRoot<SessionId> {
  private _name: string;
  private _status: SessionStatus;
  private _agentIds: Set<string>;
  private _taskIds: Set<string>;
  private _memoryNamespace: string;
  private _metadata: Record<string, unknown>;
  private _createdAt: Date;
  private _lastActiveAt: Date;
  private _expiresAt?: Date;

  private constructor(props: SessionProps) {
    super(props.id);
    this._name = props.name;
    this._status = props.status;
    this._agentIds = new Set(props.agentIds);
    this._taskIds = new Set(props.taskIds);
    this._memoryNamespace = props.memoryNamespace;
    this._metadata = { ...props.metadata };
    this._createdAt = props.createdAt;
    this._lastActiveAt = props.lastActiveAt;
    this._expiresAt = props.expiresAt;
  }

  static create(name: string, memoryNamespace?: string): Session {
    if (!name || name.trim().length === 0) {
      throw new Error('Session name cannot be empty');
    }
    const now = new Date();
    const id = SessionId.create();
    return new Session({
      id,
      name: name.trim(),
      status: 'active',
      agentIds: [],
      taskIds: [],
      memoryNamespace: memoryNamespace ?? `session:${id.value}`,
      metadata: {},
      createdAt: now,
      lastActiveAt: now,
    });
  }

  static reconstitute(props: SessionProps): Session {
    return new Session(props);
  }

  // ── Getters ──────────────────────────────────────────────────────────

  get name(): string { return this._name; }
  get status(): SessionStatus { return this._status; }
  get agentIds(): string[] { return Array.from(this._agentIds); }
  get taskIds(): string[] { return Array.from(this._taskIds); }
  get memoryNamespace(): string { return this._memoryNamespace; }
  get metadata(): Record<string, unknown> { return { ...this._metadata }; }
  get createdAt(): Date { return new Date(this._createdAt); }
  get lastActiveAt(): Date { return new Date(this._lastActiveAt); }
  get expiresAt(): Date | undefined {
    return this._expiresAt ? new Date(this._expiresAt) : undefined;
  }

  // ── Business Logic ───────────────────────────────────────────────────

  addAgent(agentId: string): void {
    this.assertActive('add agent to');
    this._agentIds.add(agentId);
    this.touch();
  }

  removeAgent(agentId: string): void {
    this._agentIds.delete(agentId);
    this.touch();
  }

  addTask(taskId: string): void {
    this.assertActive('add task to');
    this._taskIds.add(taskId);
    this.touch();
  }

  setMetadata(key: string, value: unknown): void {
    this.assertActive('set metadata on');
    this._metadata[key] = value;
    this.touch();
  }

  save(): void {
    this.assertActive('save');
    this._status = 'saved';
    this.touch();
  }

  restore(): void {
    if (this._status === 'archived' || this._status === 'expired') {
      throw new Error(`Cannot restore ${this._status} session`);
    }
    this._status = 'active';
    this.touch();
  }

  archive(): void {
    if (this._status === 'expired') {
      throw new Error('Cannot archive expired session');
    }
    this._status = 'archived';
    this.touch();
  }

  expire(): void {
    this._status = 'expired';
    this._lastActiveAt = new Date();
  }

  isActive(): boolean { return this._status === 'active'; }

  isExpired(): boolean {
    if (this._status === 'expired') return true;
    if (this._expiresAt && new Date() > this._expiresAt) return true;
    return false;
  }

  getDurationMs(): number {
    return this._lastActiveAt.getTime() - this._createdAt.getTime();
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this._id.value,
      name: this._name,
      status: this._status,
      agentIds: Array.from(this._agentIds),
      taskIds: Array.from(this._taskIds),
      memoryNamespace: this._memoryNamespace,
      metadata: this._metadata,
      createdAt: this._createdAt.toISOString(),
      lastActiveAt: this._lastActiveAt.toISOString(),
      expiresAt: this._expiresAt?.toISOString(),
    };
  }

  private assertActive(action: string): void {
    if (this._status !== 'active') {
      throw new Error(`Cannot ${action} a ${this._status} session`);
    }
  }

  private touch(): void {
    this._lastActiveAt = new Date();
  }
}
