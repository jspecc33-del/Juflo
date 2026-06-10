/**
 * HealthCheck - Domain Entity
 *
 * Represents a single health check for a system component.
 * Tracks status, latency, and failure history.
 *
 * @module v3/cli/core/domains/health-monitoring
 */

import { randomUUID } from 'crypto';
import { Entity } from '../../../shared/domain/entity.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface HealthCheckProps {
  id?: string;
  name: string;
  component: string;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
  checkedAt: Date;
  consecutiveFailures: number;
}

export class HealthCheck extends Entity<string> {
  private _name: string;
  private _component: string;
  private _status: HealthStatus;
  private _latencyMs: number;
  private _message?: string;
  private _details: Record<string, unknown>;
  private _checkedAt: Date;
  private _consecutiveFailures: number;

  private constructor(props: HealthCheckProps) {
    super(props.id ?? randomUUID());
    this._name = props.name;
    this._component = props.component;
    this._status = props.status;
    this._latencyMs = props.latencyMs;
    this._message = props.message;
    this._details = props.details ?? {};
    this._checkedAt = props.checkedAt;
    this._consecutiveFailures = props.consecutiveFailures;
  }

  static create(name: string, component: string): HealthCheck {
    return new HealthCheck({
      name,
      component,
      status: 'unknown',
      latencyMs: 0,
      checkedAt: new Date(),
      consecutiveFailures: 0,
    });
  }

  static fromResult(
    name: string,
    component: string,
    status: HealthStatus,
    latencyMs: number,
    message?: string,
    details?: Record<string, unknown>,
  ): HealthCheck {
    return new HealthCheck({
      name,
      component,
      status,
      latencyMs,
      message,
      details,
      checkedAt: new Date(),
      consecutiveFailures: 0,
    });
  }

  static reconstitute(props: HealthCheckProps): HealthCheck {
    return new HealthCheck(props);
  }

  // ── Getters ──────────────────────────────────────────────────────────

  get name(): string { return this._name; }
  get component(): string { return this._component; }
  get status(): HealthStatus { return this._status; }
  get latencyMs(): number { return this._latencyMs; }
  get message(): string | undefined { return this._message; }
  get details(): Record<string, unknown> { return { ...this._details }; }
  get checkedAt(): Date { return new Date(this._checkedAt); }
  get consecutiveFailures(): number { return this._consecutiveFailures; }

  // ── Business Logic ───────────────────────────────────────────────────

  recordSuccess(latencyMs: number, details?: Record<string, unknown>): void {
    this._status = 'healthy';
    this._latencyMs = latencyMs;
    this._details = details ?? {};
    this._message = undefined;
    this._consecutiveFailures = 0;
    this._checkedAt = new Date();
  }

  recordDegraded(latencyMs: number, message: string, details?: Record<string, unknown>): void {
    this._status = 'degraded';
    this._latencyMs = latencyMs;
    this._message = message;
    this._details = details ?? {};
    this._consecutiveFailures++;
    this._checkedAt = new Date();
  }

  recordFailure(message: string, details?: Record<string, unknown>): void {
    this._status = 'unhealthy';
    this._latencyMs = 0;
    this._message = message;
    this._details = details ?? {};
    this._consecutiveFailures++;
    this._checkedAt = new Date();
  }

  isHealthy(): boolean { return this._status === 'healthy'; }
  isDegraded(): boolean { return this._status === 'degraded'; }
  isUnhealthy(): boolean { return this._status === 'unhealthy'; }
  isStale(thresholdMs = 60_000): boolean {
    return Date.now() - this._checkedAt.getTime() > thresholdMs;
  }

  toJSON(): Record<string, unknown> {
    return {
      id: this._id,
      name: this._name,
      component: this._component,
      status: this._status,
      latencyMs: this._latencyMs,
      message: this._message,
      details: this._details,
      checkedAt: this._checkedAt.toISOString(),
      consecutiveFailures: this._consecutiveFailures,
    };
  }
}
