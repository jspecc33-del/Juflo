/**
 * ConnectionPool
 *
 * LRU-eviction connection pool for MCP transport reuse.
 * Targets >90% pool hit rate with idle timeout eviction.
 */

export interface PoolConfig {
  maxConnections?: number;
  idleTimeoutMs?: number;
  maxUsageCount?: number;
}

interface PooledConnection {
  id: string;
  endpoint: string;
  lastUsed: number;
  usageCount: number;
  isHealthy: boolean;
}

export interface PoolStats {
  size: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  evictions: number;
}

export class ConnectionPool {
  private pool: Map<string, PooledConnection> = new Map();
  private hitCount = 0;
  private missCount = 0;
  private evictions = 0;
  private readonly maxConnections: number;
  private readonly idleTimeoutMs: number;
  private readonly maxUsageCount: number;

  constructor(config: PoolConfig = {}) {
    this.maxConnections = config.maxConnections ?? 50;
    this.idleTimeoutMs = config.idleTimeoutMs ?? 300_000;
    this.maxUsageCount = config.maxUsageCount ?? 1000;
  }

  get(endpoint: string): PooledConnection {
    const available = this.findAvailable(endpoint);
    if (available) {
      available.lastUsed = Date.now();
      available.usageCount++;
      this.hitCount++;
      return available;
    }

    this.missCount++;

    if (this.pool.size >= this.maxConnections) {
      this.evictLRU();
    }

    const conn: PooledConnection = {
      id: `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      endpoint,
      lastUsed: Date.now(),
      usageCount: 1,
      isHealthy: true,
    };
    this.pool.set(conn.id, conn);
    return conn;
  }

  release(id: string): void {
    const conn = this.pool.get(id);
    if (!conn) return;
    if (conn.usageCount >= this.maxUsageCount) {
      this.pool.delete(id);
    }
  }

  preWarm(count: number, endpoint = 'default'): void {
    const toCreate = Math.min(count, this.maxConnections - this.pool.size);
    for (let i = 0; i < toCreate; i++) {
      const conn: PooledConnection = {
        id: `prewarm-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        endpoint,
        lastUsed: Date.now(),
        usageCount: 0,
        isHealthy: true,
      };
      this.pool.set(conn.id, conn);
    }
  }

  invalidate(id: string): void {
    this.pool.delete(id);
  }

  getStats(): PoolStats {
    const total = this.hitCount + this.missCount;
    return {
      size: this.pool.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: total > 0 ? this.hitCount / total : 0,
      evictions: this.evictions,
    };
  }

  clear(): void {
    this.pool.clear();
  }

  private findAvailable(endpoint: string): PooledConnection | undefined {
    const now = Date.now();
    for (const conn of this.pool.values()) {
      if (
        conn.endpoint === endpoint &&
        conn.isHealthy &&
        now - conn.lastUsed < this.idleTimeoutMs &&
        conn.usageCount < this.maxUsageCount
      ) {
        return conn;
      }
    }
    return undefined;
  }

  private evictLRU(): void {
    let oldest: PooledConnection | undefined;
    for (const conn of this.pool.values()) {
      if (!oldest || conn.lastUsed < oldest.lastUsed) {
        oldest = conn;
      }
    }
    if (oldest) {
      this.pool.delete(oldest.id);
      this.evictions++;
    }
  }
}
