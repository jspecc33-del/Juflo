/**
 * HealthMonitoringService - Domain Service
 *
 * Aggregates multiple health checks and computes overall system health.
 * Applies degradation and failure thresholds to determine system status.
 *
 * @module v3/cli/core/domains/health-monitoring
 */

import { HealthCheck, HealthStatus } from '../entities/health-check.entity.js';

export interface SystemHealthReport {
  overall: HealthStatus;
  checks: Record<string, unknown>[];
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  unknownCount: number;
  averageLatencyMs: number;
  generatedAt: string;
}

export type HealthProbe = () => Promise<{
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}>;

export class HealthMonitoringService {
  private probes = new Map<string, { component: string; probe: HealthProbe }>();
  private checks = new Map<string, HealthCheck>();

  registerProbe(name: string, component: string, probe: HealthProbe): void {
    this.probes.set(name, { component, probe });
    if (!this.checks.has(name)) {
      this.checks.set(name, HealthCheck.create(name, component));
    }
  }

  unregisterProbe(name: string): void {
    this.probes.delete(name);
    this.checks.delete(name);
  }

  async runCheck(name: string): Promise<HealthCheck | null> {
    const entry = this.probes.get(name);
    if (!entry) return null;

    const check = this.checks.get(name) ?? HealthCheck.create(name, entry.component);

    try {
      const result = await entry.probe();
      if (result.status === 'healthy') {
        check.recordSuccess(result.latencyMs, result.details);
      } else if (result.status === 'degraded') {
        check.recordDegraded(result.latencyMs, result.message ?? 'Degraded', result.details);
      } else {
        check.recordFailure(result.message ?? 'Unhealthy', result.details);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      check.recordFailure(msg);
    }

    this.checks.set(name, check);
    return check;
  }

  async runAllChecks(): Promise<HealthCheck[]> {
    const results: HealthCheck[] = [];
    for (const name of this.probes.keys()) {
      const check = await this.runCheck(name);
      if (check) results.push(check);
    }
    return results;
  }

  getSystemReport(): SystemHealthReport {
    const checks = Array.from(this.checks.values());

    let healthyCount = 0;
    let degradedCount = 0;
    let unhealthyCount = 0;
    let unknownCount = 0;
    let totalLatency = 0;
    let latencyCount = 0;

    for (const check of checks) {
      switch (check.status) {
        case 'healthy': healthyCount++; break;
        case 'degraded': degradedCount++; break;
        case 'unhealthy': unhealthyCount++; break;
        default: unknownCount++;
      }
      if (check.latencyMs > 0) {
        totalLatency += check.latencyMs;
        latencyCount++;
      }
    }

    return {
      overall: this.computeOverallStatus(healthyCount, degradedCount, unhealthyCount, checks.length),
      checks: checks.map((c) => c.toJSON()),
      healthyCount,
      degradedCount,
      unhealthyCount,
      unknownCount,
      averageLatencyMs: latencyCount > 0 ? totalLatency / latencyCount : 0,
      generatedAt: new Date().toISOString(),
    };
  }

  getCheck(name: string): HealthCheck | null {
    return this.checks.get(name) ?? null;
  }

  private computeOverallStatus(
    healthy: number,
    degraded: number,
    unhealthy: number,
    total: number,
  ): HealthStatus {
    if (total === 0) return 'unknown';
    if (unhealthy > 0) return 'unhealthy';
    if (degraded > 0) return 'degraded';
    if (healthy === total) return 'healthy';
    return 'unknown';
  }
}
