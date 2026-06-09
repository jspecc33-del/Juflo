/**
 * MCPMetrics
 *
 * Real-time performance metrics for the MCP server.
 * Tracks p95 latency, error rate, and connection pool efficiency.
 * Targets: <100ms p95, >90% pool hit rate, error rate <5%.
 */

export type HealthStatus = 'healthy' | 'warning' | 'critical';

export interface MCPMetricsSnapshot {
  requestCount: number;
  errorCount: number;
  errorRate: number;
  avgResponseTimeMs: number;
  p95ResponseTimeMs: number;
  connectionPoolHits: number;
  connectionPoolMisses: number;
  connectionPoolHitRate: number;
  startupTimeMs: number;
  health: HealthStatus;
}

export class MCPMetrics {
  private requestCount = 0;
  private errorCount = 0;
  private connectionPoolHits = 0;
  private connectionPoolMisses = 0;
  private startupTimeMs = 0;
  private readonly responseTimeBuf: number[] = [];
  private readonly bufferSize: number;
  // Sorted view is recomputed lazily: sorting 1000 samples costs ~200µs,
  // so it must not run on every snapshot when no new data arrived.
  private sortedCache: number[] = [];
  private sortedDirty = true;
  private bufSum = 0;

  constructor(bufferSize = 1000) {
    this.bufferSize = bufferSize;
  }

  recordRequest(latencyMs: number): void {
    this.requestCount++;
    this.responseTimeBuf.push(latencyMs);
    this.bufSum += latencyMs;
    if (this.responseTimeBuf.length > this.bufferSize) {
      this.bufSum -= this.responseTimeBuf.shift() as number;
    }
    this.sortedDirty = true;
  }

  recordError(): void {
    this.errorCount++;
  }

  recordConnectionPoolHit(): void {
    this.connectionPoolHits++;
  }

  recordConnectionPoolMiss(): void {
    this.connectionPoolMisses++;
  }

  recordStartup(latencyMs: number): void {
    this.startupTimeMs = latencyMs;
  }

  getSnapshot(): MCPMetricsSnapshot {
    const totalPoolOps = this.connectionPoolHits + this.connectionPoolMisses;
    const poolHitRate = totalPoolOps > 0 ? this.connectionPoolHits / totalPoolOps : 0;
    const errorRate = this.requestCount > 0 ? this.errorCount / this.requestCount : 0;
    const avg = this.average(this.responseTimeBuf);
    const p95 = this.percentile(this.responseTimeBuf, 95);

    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate,
      avgResponseTimeMs: avg,
      p95ResponseTimeMs: p95,
      connectionPoolHits: this.connectionPoolHits,
      connectionPoolMisses: this.connectionPoolMisses,
      connectionPoolHitRate: poolHitRate,
      startupTimeMs: this.startupTimeMs,
      health: this.computeHealth(errorRate, poolHitRate, p95),
    };
  }

  reset(): void {
    this.requestCount = 0;
    this.errorCount = 0;
    this.connectionPoolHits = 0;
    this.connectionPoolMisses = 0;
    this.responseTimeBuf.length = 0;
    this.sortedCache = [];
    this.sortedDirty = true;
    this.bufSum = 0;
  }

  private computeHealth(errorRate: number, poolHitRate: number, p95: number): HealthStatus {
    if (errorRate > 0.1 || poolHitRate < 0.5 || p95 > 500) return 'critical';
    if (errorRate > 0.05 || poolHitRate < 0.7 || p95 > 200) return 'warning';
    return 'healthy';
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return this.bufSum / arr.length;
  }

  private percentile(arr: number[], pct: number): number {
    if (arr.length === 0) return 0;
    if (this.sortedDirty) {
      this.sortedCache = [...arr].sort((a, b) => a - b);
      this.sortedDirty = false;
    }
    const idx = Math.ceil((pct / 100) * this.sortedCache.length) - 1;
    return this.sortedCache[Math.max(0, idx)];
  }
}
