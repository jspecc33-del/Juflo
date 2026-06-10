/**
 * Health Monitoring Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { HealthCheck } from '../../src/core/domains/health-monitoring/entities/health-check.entity.js';
import { HealthMonitoringService } from '../../src/core/domains/health-monitoring/services/health-monitoring.service.js';

describe('HealthCheck entity', () => {
  let check: HealthCheck;

  beforeEach(() => {
    check = HealthCheck.create('db', 'database-service');
  });

  it('starts as unknown', () => {
    expect(check.status).toBe('unknown');
    expect(check.consecutiveFailures).toBe(0);
  });

  it('recordSuccess marks healthy and resets failures', () => {
    check.recordFailure('err');
    check.recordSuccess(8, { rows: 100 });
    expect(check.status).toBe('healthy');
    expect(check.latencyMs).toBe(8);
    expect(check.consecutiveFailures).toBe(0);
    expect(check.isHealthy()).toBe(true);
  });

  it('recordDegraded increments failures', () => {
    check.recordDegraded(500, 'slow');
    expect(check.status).toBe('degraded');
    expect(check.message).toBe('slow');
    expect(check.consecutiveFailures).toBe(1);
    expect(check.isDegraded()).toBe(true);
  });

  it('recordFailure increments failures', () => {
    check.recordFailure('timeout');
    check.recordFailure('timeout');
    expect(check.consecutiveFailures).toBe(2);
    expect(check.isUnhealthy()).toBe(true);
  });

  it('isStale returns true after threshold elapsed', () => {
    vi.useFakeTimers();
    vi.advanceTimersByTime(61_000);
    expect(check.isStale(60_000)).toBe(true);
    vi.useRealTimers();
  });

  it('fromResult factory creates a check with given values', () => {
    const c = HealthCheck.fromResult('api', 'api-svc', 'healthy', 15, undefined, { ok: true });
    expect(c.status).toBe('healthy');
    expect(c.latencyMs).toBe(15);
  });

  it('serializes to JSON', () => {
    check.recordSuccess(10);
    const json = check.toJSON();
    expect(json).toMatchObject({ name: 'db', component: 'database-service', status: 'healthy' });
  });
});

describe('HealthMonitoringService', () => {
  let service: HealthMonitoringService;

  beforeEach(() => {
    service = new HealthMonitoringService();
  });

  it('returns unknown overall with no probes', () => {
    expect(service.getSystemReport().overall).toBe('unknown');
  });

  it('reports healthy when probe succeeds', async () => {
    service.registerProbe('db', 'db', async () => ({ status: 'healthy', latencyMs: 5 }));
    await service.runAllChecks();
    expect(service.getSystemReport().overall).toBe('healthy');
  });

  it('reports unhealthy when probe throws', async () => {
    service.registerProbe('bad', 'svc', async () => { throw new Error('down'); });
    await service.runAllChecks();
    const report = service.getSystemReport();
    expect(report.overall).toBe('unhealthy');
    expect(report.unhealthyCount).toBe(1);
  });

  it('reports degraded with mixed probes', async () => {
    service.registerProbe('ok', 'a', async () => ({ status: 'healthy', latencyMs: 1 }));
    service.registerProbe('slow', 'b', async () => ({
      status: 'degraded', latencyMs: 800, message: 'slow',
    }));
    await service.runAllChecks();
    expect(service.getSystemReport().overall).toBe('degraded');
  });

  it('runCheck returns null for unknown probe', async () => {
    expect(await service.runCheck('unknown')).toBeNull();
  });

  it('unregistering removes probe from subsequent runs', async () => {
    service.registerProbe('tmp', 'c', async () => ({ status: 'healthy', latencyMs: 1 }));
    service.unregisterProbe('tmp');
    const checks = await service.runAllChecks();
    expect(checks).toHaveLength(0);
  });

  it('averageLatencyMs is computed correctly', async () => {
    service.registerProbe('p1', 'a', async () => ({ status: 'healthy', latencyMs: 10 }));
    service.registerProbe('p2', 'b', async () => ({ status: 'healthy', latencyMs: 20 }));
    await service.runAllChecks();
    expect(service.getSystemReport().averageLatencyMs).toBe(15);
  });
});
