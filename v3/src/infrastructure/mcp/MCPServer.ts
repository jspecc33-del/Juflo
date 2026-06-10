/**
 * MCPServer
 *
 * Model Context Protocol server for V3.
 * Provides MCP-first API design per ADR-005.
 *
 * Optimized per v3-mcp-optimization:
 * - FastToolRegistry: O(1) tool lookup with LRU hot-tool cache
 * - ConnectionPool: connection reuse with LRU eviction (>90% hit target)
 * - MCPMetrics: p95 latency, error rate, pool hit rate (<100ms p95 target)
 */

import { ConnectionPool, type PoolStats } from './ConnectionPool';
import { FastToolRegistry, type RegistryStats } from './FastToolRegistry';
import { MCPMetrics, type MCPMetricsSnapshot } from './MCPMetrics';
import type {
  MCPServerOptions,
  MCPTool,
  MCPToolProvider,
  MCPRequest,
  MCPResponse
} from '../../shared/types';

export class MCPServer {
  private tools: MCPToolProvider[];
  private port: number;
  private host: string;
  private running: boolean = false;
  private registry: FastToolRegistry;
  private connectionPool: ConnectionPool;
  private metrics: MCPMetrics;
  private providerByTool: Map<string, MCPToolProvider> = new Map();

  constructor(options: MCPServerOptions = {}) {
    this.tools = options.tools || [];
    this.port = options.port || 3000;
    this.host = options.host || 'localhost';
    this.registry = new FastToolRegistry();
    this.connectionPool = new ConnectionPool();
    this.metrics = new MCPMetrics();
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    if (this.running) return;
    const startedAt = Date.now();

    // Build O(1) tool index and provider routing table
    const allTools: MCPTool[] = [];
    for (const provider of this.tools) {
      if (provider.getTools) {
        for (const tool of provider.getTools()) {
          allTools.push(tool);
          this.providerByTool.set(tool.name, provider);
        }
      }
    }
    this.registry.buildIndex(allTools);

    // Pre-warm connection pool to avoid cold-start misses
    this.connectionPool.preWarm(5);

    this.running = true;
    this.metrics.recordStartup(Date.now() - startedAt);
  }

  /**
   * Stop the MCP server
   */
  async stop(): Promise<void> {
    this.running = false;
    this.registry.clear();
    this.providerByTool.clear();
    this.connectionPool.clear();
  }

  /**
   * Register a tool
   */
  registerTool(tool: MCPTool, provider?: MCPToolProvider): void {
    this.registry.register(tool);
    if (provider) {
      this.providerByTool.set(tool.name, provider);
    }
  }

  /**
   * List all available tools
   */
  listTools(): MCPTool[] {
    return this.registry.findAll();
  }

  /**
   * Handle an MCP request
   */
  async handleRequest(request: MCPRequest): Promise<MCPResponse> {
    const start = Date.now();
    const conn = this.connectionPool.get('default');
    if (conn.usageCount > 1) {
      this.metrics.recordConnectionPoolHit();
    } else {
      this.metrics.recordConnectionPoolMiss();
    }

    try {
      // O(1) provider routing via tool index
      const directProvider = this.providerByTool.get(request.method);
      if (directProvider) {
        const result = await directProvider.execute(request.method, request.params);
        const latency = Date.now() - start;
        this.metrics.recordRequest(latency);
        this.registry.recordUsage(request.method, latency);
        return { id: request.id, result };
      }

      // Fallback: scan providers for methods outside the tool index
      for (const provider of this.tools) {
        try {
          const result = await provider.execute(request.method, request.params);
          this.metrics.recordRequest(Date.now() - start);
          return { id: request.id, result };
        } catch {
          // Tool provider doesn't handle this method, try next
          continue;
        }
      }

      this.metrics.recordError();
      return {
        id: request.id,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`
        }
      };
    } catch (error) {
      this.metrics.recordError();
      return {
        id: request.id,
        error: {
          code: -32603,
          message: error instanceof Error ? error.message : 'Internal error'
        }
      };
    } finally {
      this.connectionPool.release(conn.id);
    }
  }

  /**
   * Get server status
   */
  getStatus(): { running: boolean; port: number; host: string; toolCount: number } {
    return {
      running: this.running,
      port: this.port,
      host: this.host,
      toolCount: this.registry.getStats().totalTools
    };
  }

  /**
   * Get real-time performance metrics
   */
  getMetrics(): MCPMetricsSnapshot {
    return this.metrics.getSnapshot();
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): PoolStats {
    return this.connectionPool.getStats();
  }

  /**
   * Get tool registry statistics (cache hit rate, top tools)
   */
  getRegistryStats(): RegistryStats {
    return this.registry.getStats();
  }
}

export { MCPServer as default };
