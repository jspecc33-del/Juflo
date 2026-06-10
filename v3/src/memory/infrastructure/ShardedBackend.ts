/**
 * ShardedBackend
 *
 * Horizontally shards memories across multiple MemoryBackend instances.
 * Routes writes/reads by agentId (or custom key extractor) and fans out
 * cross-shard queries to all relevant shards.
 */

import type {
  Memory,
  MemoryBackend,
  MemoryQuery,
  MemorySearchResult,
  ShardConfig,
  ShardedBackendOptions,
} from '../../shared/types';

export class ShardedBackend implements MemoryBackend {
  private shards: Map<string, ShardConfig>;
  private shardList: ShardConfig[];
  private shardKeyExtractor: (memory: Memory) => string;
  private initialized: boolean = false;

  constructor(options: ShardedBackendOptions) {
    if (!options.shards || options.shards.length === 0) {
      throw new Error('ShardedBackend requires at least one shard');
    }

    this.shards = new Map(options.shards.map(s => [s.id, s]));
    this.shardList = options.shards;
    this.shardKeyExtractor = options.shardKeyExtractor ?? defaultShardKeyExtractor;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await Promise.all(this.shardList.map(s => s.backend.initialize()));
    this.initialized = true;
  }

  async close(): Promise<void> {
    await Promise.all(this.shardList.map(s => s.backend.close()));
    this.initialized = false;
  }

  async store(memory: Memory): Promise<Memory> {
    return this.resolveShardForMemory(memory).backend.store(memory);
  }

  async retrieve(id: string): Promise<Memory | undefined> {
    const results = await Promise.all(this.shardList.map(s => s.backend.retrieve(id)));
    return results.find(r => r !== undefined);
  }

  async update(memory: Memory): Promise<void> {
    return this.resolveShardForMemory(memory).backend.update(memory);
  }

  async delete(id: string): Promise<void> {
    await Promise.all(this.shardList.map(s => s.backend.delete(id)));
  }

  async query(query: MemoryQuery): Promise<Memory[]> {
    const targetShards = this.resolveShardsForQuery(query);
    const shardResults = await Promise.all(targetShards.map(s => s.backend.query(query)));

    const merged = shardResults.flat();
    merged.sort((a, b) => b.timestamp - a.timestamp);

    const offset = query.offset ?? 0;
    const limit = query.limit;
    const paginated = merged.slice(offset);
    return limit !== undefined ? paginated.slice(0, limit) : paginated;
  }

  async vectorSearch(embedding: number[], k: number = 10): Promise<MemorySearchResult[]> {
    const shardResults = await Promise.all(
      this.shardList.map(s => s.backend.vectorSearch(embedding, k))
    );

    const merged = shardResults.flat();
    merged.sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0));
    return merged.slice(0, k);
  }

  async clearAgent(agentId: string): Promise<void> {
    await Promise.all(
      this.shardList.map(s => s.backend.clearAgent?.(agentId) ?? Promise.resolve())
    );
  }

  /**
   * Get the backend for a specific agent (for direct shard access).
   */
  getBackendForAgent(agentId: string): MemoryBackend {
    return this.resolveShardByKey(agentId).backend;
  }

  /**
   * Get all shard IDs.
   */
  getShardIds(): string[] {
    return [...this.shards.keys()];
  }

  /**
   * Get shard count.
   */
  getShardCount(): number {
    return this.shardList.length;
  }

  private resolveShardForMemory(memory: Memory): ShardConfig {
    return this.resolveShardByKey(this.shardKeyExtractor(memory));
  }

  private resolveShardByKey(key: string): ShardConfig {
    for (const shard of this.shardList) {
      if (shard.domains?.some(d => key.startsWith(d))) {
        return shard;
      }
    }
    const idx = Math.abs(hashCode(key)) % this.shardList.length;
    return this.shardList[idx];
  }

  private resolveShardsForQuery(query: MemoryQuery): ShardConfig[] {
    if (!query.agentId) {
      return this.shardList;
    }
    return [this.resolveShardByKey(query.agentId)];
  }
}

function defaultShardKeyExtractor(memory: Memory): string {
  return memory.agentId;
}

function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export { ShardedBackend as default };
