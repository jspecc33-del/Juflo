/**
 * Unit Tests: SwarmCoordinator
 *
 * Tests for agent spawning, termination, task distribution, execution, and scaling.
 * London School TDD: mock dependencies (memoryBackend, pluginManager).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { SwarmCoordinator } from '../../src/coordination/application/SwarmCoordinator';
import type { AgentConfig, MemoryBackend, Task as ITask } from '../../src/shared/types';

function createMockMemoryBackend(): MemoryBackend {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    store: vi.fn().mockResolvedValue({}),
    retrieve: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue([]),
    vectorSearch: vi.fn().mockResolvedValue([]),
  };
}

function createCoordinator(opts: { memoryBackend?: MemoryBackend } = {}) {
  return new SwarmCoordinator({
    topology: 'hierarchical',
    memoryBackend: opts.memoryBackend,
  });
}

function agentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: 'coder',
    capabilities: ['code', 'test'],
    ...overrides,
  };
}

function taskConfig(overrides: Partial<ITask> = {}): ITask {
  return {
    id: 'task-1',
    type: 'code',
    description: 'Write code',
    priority: 'medium',
    ...overrides,
  };
}

describe('SwarmCoordinator', () => {
  let coordinator: SwarmCoordinator;

  beforeEach(() => {
    coordinator = createCoordinator();
  });

  describe('initialize / shutdown', () => {
    it('should initialize without error', async () => {
      await expect(coordinator.initialize()).resolves.toBeUndefined();
    });

    it('should be idempotent on double init', async () => {
      await coordinator.initialize();
      await expect(coordinator.initialize()).resolves.toBeUndefined();
    });

    it('should shutdown and clear agents', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1' }));
      await coordinator.shutdown();
      const agents = await coordinator.listAgents();
      expect(agents).toHaveLength(0);
    });
  });

  describe('spawnAgent', () => {
    it('should create and return a new agent', async () => {
      const agent = await coordinator.spawnAgent(agentConfig({ id: 'test-agent' }));
      expect(agent.id).toBe('test-agent');
      expect(agent.status).toBe('active');
    });

    it('should add agent to the agent list', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1' }));
      const agents = await coordinator.listAgents();
      expect(agents).toHaveLength(1);
    });

    it('should store spawn event in memory backend', async () => {
      const memoryBackend = createMockMemoryBackend();
      const coord = createCoordinator({ memoryBackend });
      await coord.spawnAgent(agentConfig({ id: 'a1' }));
      expect(memoryBackend.store).toHaveBeenCalled();
    });
  });

  describe('terminateAgent', () => {
    it('should remove agent from the list', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1' }));
      await coordinator.terminateAgent('a1');
      const agents = await coordinator.listAgents();
      expect(agents).toHaveLength(0);
    });

    it('should be a no-op for non-existent agent', async () => {
      await expect(coordinator.terminateAgent('nonexistent')).resolves.toBeUndefined();
    });
  });

  describe('distributeTasks', () => {
    it('should assign tasks to active agents', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1', capabilities: ['code'] }));
      await coordinator.spawnAgent(agentConfig({ id: 'a2', capabilities: ['code'] }));

      const tasks: ITask[] = [
        taskConfig({ id: 't1' }),
        taskConfig({ id: 't2' }),
      ];

      const assignments = await coordinator.distributeTasks(tasks);
      expect(assignments).toHaveLength(2);
      expect(assignments[0].taskId).toBeDefined();
      expect(assignments[0].agentId).toBeDefined();
    });

    it('should load-balance across agents', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1', capabilities: ['code'] }));
      await coordinator.spawnAgent(agentConfig({ id: 'a2', capabilities: ['code'] }));

      const tasks: ITask[] = [
        taskConfig({ id: 't1' }),
        taskConfig({ id: 't2' }),
      ];

      const assignments = await coordinator.distributeTasks(tasks);
      const agents = assignments.map(a => a.agentId);
      // With 2 tasks and 2 agents, both should get assigned
      expect(new Set(agents).size).toBe(2);
    });

    it('should skip tasks when no suitable agent exists', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1', capabilities: ['test'] }));

      const tasks: ITask[] = [taskConfig({ id: 't1', type: 'deploy' })];
      const assignments = await coordinator.distributeTasks(tasks);
      expect(assignments).toHaveLength(0);
    });
  });

  describe('executeTask', () => {
    it('should execute task on specified agent', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1' }));
      const result = await coordinator.executeTask('a1', taskConfig());
      expect(result.status).toBe('completed');
      expect(result.taskId).toBe('task-1');
    });

    it('should return failure for non-existent agent', async () => {
      const result = await coordinator.executeTask('nonexistent', taskConfig());
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not found');
    });

    it('should store result in memory backend', async () => {
      const memoryBackend = createMockMemoryBackend();
      const coord = createCoordinator({ memoryBackend });
      await coord.spawnAgent(agentConfig({ id: 'a1' }));
      await coord.executeTask('a1', taskConfig());
      // store called for spawn + task result
      expect(memoryBackend.store).toHaveBeenCalledTimes(2);
    });
  });

  describe('executeTasksConcurrently', () => {
    it('should execute multiple tasks and return results', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1', capabilities: ['code'] }));
      await coordinator.spawnAgent(agentConfig({ id: 'a2', capabilities: ['code'] }));

      const tasks: ITask[] = [
        taskConfig({ id: 't1' }),
        taskConfig({ id: 't2' }),
      ];

      const results = await coordinator.executeTasksConcurrently(tasks);
      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'completed')).toBe(true);
    });
  });

  describe('getSwarmState', () => {
    it('should return topology and agent list', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1' }));
      const state = await coordinator.getSwarmState();
      expect(state.topology).toBe('hierarchical');
      expect(state.agents).toHaveLength(1);
    });
  });

  describe('getTopology', () => {
    it('should return the configured topology', () => {
      expect(coordinator.getTopology()).toBe('hierarchical');
    });
  });

  describe('scaleAgents', () => {
    it('should scale up by adding agents', async () => {
      await coordinator.scaleAgents({ type: 'coder', count: 3 });
      const agents = await coordinator.listAgents();
      expect(agents).toHaveLength(3);
    });

    it('should scale down by removing agents', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1', type: 'coder' }));
      await coordinator.spawnAgent(agentConfig({ id: 'a2', type: 'coder' }));
      await coordinator.scaleAgents({ type: 'coder', count: -1 });
      const agents = await coordinator.listAgents();
      expect(agents).toHaveLength(1);
    });
  });

  describe('reachConsensus', () => {
    it('should return a consensus result with votes', async () => {
      await coordinator.spawnAgent(agentConfig({ id: 'a1' }));
      await coordinator.spawnAgent(agentConfig({ id: 'a2' }));
      await coordinator.spawnAgent(agentConfig({ id: 'a3' }));

      const decision = { id: 'd1', type: 'approve', payload: { action: 'deploy' } };
      const result = await coordinator.reachConsensus(decision, ['a1', 'a2', 'a3']);

      expect(result.votes).toHaveLength(3);
      expect(typeof result.consensusReached).toBe('boolean');
    });
  });

  describe('sendMessage', () => {
    it('should emit agent:message event', async () => {
      const eventBus = new EventEmitter();
      const coord = new SwarmCoordinator({
        topology: 'mesh',
        eventBus,
      });

      const handler = vi.fn();
      eventBus.on('agent:message', handler);

      await coord.sendMessage({
        from: 'a1',
        to: 'a2',
        type: 'request',
        payload: { data: 'hello' },
      });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({
        from: 'a1',
        to: 'a2',
        type: 'request',
      });
    });
  });
});
