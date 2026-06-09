/**
 * FastToolRegistry
 *
 * O(1) hash-map tool lookup with LRU cache for hot tools.
 * Tracks per-tool usage counts and average latency.
 */

import type { MCPTool } from '../../shared/types';

interface ToolEntry {
  tool: MCPTool;
  usageCount: number;
  totalLatencyMs: number;
}

export interface RegistryStats {
  totalTools: number;
  cacheSize: number;
  cacheHitCount: number;
  cacheMissCount: number;
  cacheHitRate: number;
  topTools: Array<{ name: string; usageCount: number; avgLatencyMs: number }>;
}

export class FastToolRegistry {
  private index: Map<string, ToolEntry> = new Map();
  private lruCache: Map<string, ToolEntry> = new Map();
  private cacheHitCount = 0;
  private cacheMissCount = 0;
  private readonly maxCacheSize: number;

  constructor(maxCacheSize = 100) {
    this.maxCacheSize = maxCacheSize;
  }

  buildIndex(tools: MCPTool[]): void {
    this.index.clear();
    this.lruCache.clear();
    for (const tool of tools) {
      this.index.set(tool.name, { tool, usageCount: 0, totalLatencyMs: 0 });
    }
  }

  register(tool: MCPTool): void {
    const existing = this.index.get(tool.name);
    this.index.set(tool.name, {
      tool,
      usageCount: existing?.usageCount ?? 0,
      totalLatencyMs: existing?.totalLatencyMs ?? 0,
    });
    this.lruCache.delete(tool.name);
  }

  find(name: string): MCPTool | undefined {
    const cached = this.lruCache.get(name);
    if (cached) {
      // Refresh position (most recently used)
      this.lruCache.delete(name);
      this.lruCache.set(name, cached);
      this.cacheHitCount++;
      return cached.tool;
    }

    const entry = this.index.get(name);
    if (!entry) {
      this.cacheMissCount++;
      return undefined;
    }

    this.cacheMissCount++;
    this.promoteToCache(name, entry);
    return entry.tool;
  }

  findAll(): MCPTool[] {
    return Array.from(this.index.values()).map(e => e.tool);
  }

  unregister(name: string): void {
    this.index.delete(name);
    this.lruCache.delete(name);
  }

  recordUsage(name: string, latencyMs: number): void {
    const entry = this.index.get(name);
    if (entry) {
      entry.usageCount++;
      entry.totalLatencyMs += latencyMs;
    }
    // Also update cached copy if present
    const cached = this.lruCache.get(name);
    if (cached && cached !== entry) {
      cached.usageCount++;
      cached.totalLatencyMs += latencyMs;
    }
  }

  clear(): void {
    this.index.clear();
    this.lruCache.clear();
  }

  getStats(): RegistryStats {
    const total = this.cacheHitCount + this.cacheMissCount;
    const topTools = Array.from(this.index.values())
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 10)
      .map(e => ({
        name: e.tool.name,
        usageCount: e.usageCount,
        avgLatencyMs: e.usageCount > 0 ? e.totalLatencyMs / e.usageCount : 0,
      }));
    return {
      totalTools: this.index.size,
      cacheSize: this.lruCache.size,
      cacheHitCount: this.cacheHitCount,
      cacheMissCount: this.cacheMissCount,
      cacheHitRate: total > 0 ? this.cacheHitCount / total : 0,
      topTools,
    };
  }

  private promoteToCache(name: string, entry: ToolEntry): void {
    if (this.lruCache.size >= this.maxCacheSize) {
      const firstKey = this.lruCache.keys().next().value;
      if (firstKey !== undefined) {
        this.lruCache.delete(firstKey);
      }
    }
    this.lruCache.set(name, entry);
  }
}
