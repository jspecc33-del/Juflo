/**
 * HybridBackend
 *
 * Combines SQLite for structured queries with AgentDB for vector search.
 * Per ADR-009: Hybrid Memory Backend Default.
 */

import type {
  Memory,
  MemoryBackend,
  MemoryQuery,
  MemorySearchResult,
  MetadataFilters,
  MetadataFilterValue,
  HybridSearchOptions,
  HybridSearchResult,
} from '../../shared/types';
import { SQLiteBackend } from './SQLiteBackend';
import { AgentDBBackend } from './AgentDBBackend';

export class HybridBackend implements MemoryBackend {
  private sqliteBackend: SQLiteBackend;
  private agentDbBackend: AgentDBBackend;
  private initialized: boolean = false;

  constructor(sqliteBackend: SQLiteBackend, agentDbBackend: AgentDBBackend) {
    this.sqliteBackend = sqliteBackend;
    this.agentDbBackend = agentDbBackend;
  }

  /**
   * Initialize both backends
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await Promise.all([
      this.sqliteBackend.initialize(),
      this.agentDbBackend.initialize()
    ]);

    this.initialized = true;
  }

  /**
   * Close both backends
   */
  async close(): Promise<void> {
    await Promise.all([
      this.sqliteBackend.close(),
      this.agentDbBackend.close()
    ]);
    this.initialized = false;
  }

  /**
   * Store memory in both backends
   */
  async store(memory: Memory): Promise<Memory> {
    // Store in SQLite for structured queries
    await this.sqliteBackend.store(memory);

    // Store in AgentDB if has embedding
    if (memory.embedding && memory.embedding.length > 0) {
      await this.agentDbBackend.store(memory);
    }

    return memory;
  }

  /**
   * Retrieve memory by ID (from SQLite primary)
   */
  async retrieve(id: string): Promise<Memory | undefined> {
    return this.sqliteBackend.retrieve(id);
  }

  /**
   * Update memory in both backends
   */
  async update(memory: Memory): Promise<void> {
    await this.sqliteBackend.update(memory);

    if (memory.embedding && memory.embedding.length > 0) {
      await this.agentDbBackend.update(memory);
    }
  }

  /**
   * Delete memory from both backends
   */
  async delete(id: string): Promise<void> {
    await Promise.all([
      this.sqliteBackend.delete(id),
      this.agentDbBackend.delete(id)
    ]);
  }

  /**
   * Query memories using SQLite
   */
  async query(query: MemoryQuery): Promise<Memory[]> {
    return this.sqliteBackend.query(query);
  }

  /**
   * Vector search using AgentDB (150x-12,500x faster with HNSW)
   */
  async vectorSearch(embedding: number[], k: number = 10): Promise<MemorySearchResult[]> {
    return this.agentDbBackend.vectorSearch(embedding, k);
  }

  /**
   * Clear all memories for an agent
   */
  async clearAgent(agentId: string): Promise<void> {
    await Promise.all([
      this.sqliteBackend.clearAgent(agentId),
      this.agentDbBackend.clearAgent(agentId)
    ]);
  }

  /**
   * Hybrid search: combine SQL filtering with vector similarity
   */
  async hybridSearch(
    query: MemoryQuery,
    embedding?: number[],
    k: number = 10
  ): Promise<MemorySearchResult[]> {
    if (!embedding) {
      // No embedding, fall back to SQL query
      const results = await this.query(query);
      return results.map(m => ({ ...m, similarity: 1.0 }));
    }

    // Get vector search results
    const vectorResults = await this.vectorSearch(embedding, k * 2);

    // Filter by query criteria
    let filtered = vectorResults;

    if (query.agentId) {
      filtered = filtered.filter(m => m.agentId === query.agentId);
    }
    if (query.type) {
      filtered = filtered.filter(m => m.type === query.type);
    }
    if (query.timeRange) {
      filtered = filtered.filter(
        m => m.timestamp >= query.timeRange!.start && m.timestamp <= query.timeRange!.end
      );
    }
    if (query.metadata) {
      filtered = filtered.filter(m => {
        if (!m.metadata) return false;
        return Object.entries(query.metadata!).every(
          ([key, value]) => m.metadata![key] === value
        );
      });
    }

    return filtered.slice(0, k);
  }

  /**
   * Advanced hybrid search: vector similarity + operator-based metadata filters + weighted scoring.
   *
   * Filters support: $gte, $lte, $gt, $lt, $ne, $in, $contains, or exact primitives.
   * Weights default to 70% vector / 30% metadata when filters are provided, else 100% vector.
   */
  async hybridSearchAdvanced(
    embedding: number[],
    options: HybridSearchOptions = {}
  ): Promise<HybridSearchResult[]> {
    const k = options.k ?? 10;
    const filters = options.filters ?? {};
    const hasFilters = Object.keys(filters).length > 0;
    const weights = options.weights ?? {
      vectorSimilarity: hasFilters ? 0.7 : 1.0,
      metadataScore: hasFilters ? 0.3 : 0.0,
    };

    // Fetch a larger candidate set so post-filter still yields k results
    const candidates = await this.agentDbBackend.vectorSearch(embedding, k * 3);

    // Apply structural filters (agentId, type, timeRange)
    let filtered: MemorySearchResult[] = candidates;
    if (options.agentId) {
      filtered = filtered.filter(m => m.agentId === options.agentId);
    }
    if (options.type) {
      filtered = filtered.filter(m => m.type === options.type);
    }
    if (options.timeRange) {
      filtered = filtered.filter(
        m => m.timestamp >= options.timeRange!.start && m.timestamp <= options.timeRange!.end
      );
    }

    // Score and filter by metadata operators
    const scored: HybridSearchResult[] = filtered.map(m => {
      const vectorScore = m.similarity ?? 0;
      const metaScore = hasFilters ? this.computeMetadataScore(m, filters) : 0;

      // Discard if any filter condition has zero contribution (strict mode when exact match expected)
      const passesFilter = !hasFilters || this.passesAllFilters(m, filters);

      return {
        ...m,
        vectorScore,
        metadataScore: metaScore,
        hybridScore: passesFilter
          ? vectorScore * weights.vectorSimilarity + metaScore * weights.metadataScore
          : -1,
      };
    });

    return scored
      .filter(r => r.hybridScore >= 0)
      .sort((a, b) => b.hybridScore - a.hybridScore)
      .slice(0, k);
  }

  /**
   * Get backend statistics
   */
  getStats(): { sqlite: number; agentdb: number } {
    return {
      sqlite: this.sqliteBackend.getCount(),
      agentdb: 0 // AgentDB doesn't expose count directly
    };
  }

  private passesAllFilters(memory: Memory, filters: MetadataFilters): boolean {
    if (!memory.metadata) return false;
    return Object.entries(filters).every(([key, filter]) =>
      this.evaluateFilter(memory.metadata![key], filter)
    );
  }

  private computeMetadataScore(memory: Memory, filters: MetadataFilters): number {
    if (!memory.metadata) return 0;
    const keys = Object.keys(filters);
    if (keys.length === 0) return 0;
    const matched = keys.filter(k => this.evaluateFilter(memory.metadata![k], filters[k])).length;
    return matched / keys.length;
  }

  private evaluateFilter(value: unknown, filter: MetadataFilterValue): boolean {
    if (typeof filter !== 'object' || filter === null || Array.isArray(filter)) {
      return value === filter;
    }

    const f = filter as Record<string, unknown>;
    if ('$gte' in f && typeof value === 'number') {
      if (value < (f.$gte as number)) return false;
    }
    if ('$lte' in f && typeof value === 'number') {
      if (value > (f.$lte as number)) return false;
    }
    if ('$gt' in f && typeof value === 'number') {
      if (value <= (f.$gt as number)) return false;
    }
    if ('$lt' in f && typeof value === 'number') {
      if (value >= (f.$lt as number)) return false;
    }
    if ('$ne' in f) {
      if (value === f.$ne) return false;
    }
    if ('$in' in f && Array.isArray(f.$in)) {
      if (!(f.$in as unknown[]).includes(value)) return false;
    }
    if ('$contains' in f && typeof value === 'string') {
      if (!value.includes(f.$contains as string)) return false;
    }
    return true;
  }
}

export { HybridBackend as default };
