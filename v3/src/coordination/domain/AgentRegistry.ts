/**
 * AgentRegistry — Domain Service
 *
 * Owns agent lifecycle: spawn, terminate, scale, and metrics.
 * Extracted from SwarmCoordinator per DDD bounded-context decomposition.
 */

import { EventEmitter } from 'events';
import { Agent } from '../../agent-lifecycle/domain/Agent';
import type {
  AgentConfig,
  AgentMetrics,
  MemoryBackend
} from '../../shared/types';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();
  private metrics: Map<string, AgentMetrics> = new Map();

  constructor(
    private eventBus: EventEmitter,
    private memoryBackend?: MemoryBackend
  ) {}

  async spawn(config: AgentConfig): Promise<Agent> {
    const agent = new Agent(config);
    this.agents.set(agent.id, agent);
    this.metrics.set(agent.id, {
      agentId: agent.id,
      tasksCompleted: 0,
      tasksFailed: 0,
      averageExecutionTime: 0,
      successRate: 1.0,
      health: 'healthy',
    });

    this.eventBus.emit('agent:spawned', { agentId: agent.id, type: agent.type });

    if (this.memoryBackend) {
      await this.memoryBackend.store({
        id: `agent-spawn-${agent.id}`,
        agentId: 'system',
        content: `Agent ${agent.id} spawned`,
        type: 'event',
        timestamp: Date.now(),
        metadata: { eventType: 'agent-spawn', agentId: agent.id, agentType: agent.type },
      });
    }

    return agent;
  }

  terminate(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    agent.terminate();
    this.agents.delete(agentId);
    this.metrics.delete(agentId);
    this.eventBus.emit('agent:terminated', { agentId });
  }

  list(): Agent[] {
    return Array.from(this.agents.values());
  }

  get(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  async scale(config: { type: string; count: number }): Promise<void> {
    const existing = this.list().filter(a => a.type === config.type);
    const current = existing.length;
    const target = current + config.count;

    if (config.count > 0) {
      for (let i = current; i < target; i++) {
        await this.spawn({
          id: `${config.type}-${Date.now()}-${i}`,
          type: config.type,
          capabilities: getDefaultCapabilities(config.type),
        });
      }
    } else if (config.count < 0) {
      for (const agent of existing.slice(0, Math.abs(config.count))) {
        this.terminate(agent.id);
      }
    }
  }

  recordTaskResult(agentId: string, status: 'completed' | 'failed', duration: number): void {
    const m = this.metrics.get(agentId);
    if (!m) return;
    if (status === 'completed') m.tasksCompleted++;
    else m.tasksFailed = (m.tasksFailed ?? 0) + 1;
    const total = m.tasksCompleted + (m.tasksFailed ?? 0);
    m.successRate = m.tasksCompleted / total;
    m.averageExecutionTime = (m.averageExecutionTime * (total - 1) + duration) / total;
  }

  getMetrics(agentId: string): AgentMetrics {
    return this.metrics.get(agentId) ?? {
      agentId,
      tasksCompleted: 0,
      averageExecutionTime: 0,
      successRate: 0,
      health: 'unhealthy',
    };
  }

  clear(): void {
    for (const agent of this.agents.values()) agent.terminate();
    this.agents.clear();
    this.metrics.clear();
  }

  size(): number {
    return this.agents.size;
  }
}

function getDefaultCapabilities(type: string): string[] {
  const defaults: Record<string, string[]> = {
    coder: ['code', 'refactor', 'debug'],
    tester: ['test', 'validate', 'e2e'],
    reviewer: ['review', 'analyze', 'security-audit'],
    coordinator: ['coordinate', 'manage', 'orchestrate'],
    designer: ['design', 'prototype'],
    deployer: ['deploy', 'release'],
  };
  return defaults[type] ?? [];
}
