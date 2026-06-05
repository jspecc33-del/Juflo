/**
 * Unit Tests: Agent Domain Entity
 *
 * Tests for agent lifecycle, task execution, capability checking, and state transitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../../src/agent-lifecycle/domain/Agent';
import type { AgentConfig, Task } from '../../src/shared/types';

function createConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-1',
    type: 'coder',
    capabilities: ['code', 'test'],
    role: 'worker',
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'code',
    description: 'Write code',
    priority: 'medium',
    ...overrides,
  };
}

describe('Agent', () => {
  let agent: Agent;

  beforeEach(() => {
    agent = new Agent(createConfig());
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(agent.id).toBe('agent-1');
      expect(agent.type).toBe('coder');
      expect(agent.status).toBe('active');
      expect(agent.capabilities).toEqual(['code', 'test']);
      expect(agent.role).toBe('worker');
    });

    it('should default capabilities to empty array when not provided', () => {
      const a = new Agent({ id: 'a', type: 'coder' });
      expect(a.capabilities).toEqual([]);
    });

    it('should default metadata to empty object when not provided', () => {
      const a = new Agent({ id: 'a', type: 'coder' });
      expect(a.metadata).toEqual({});
    });

    it('should set createdAt and lastActive to current time', () => {
      const before = Date.now();
      const a = new Agent(createConfig());
      const after = Date.now();
      expect(a.createdAt).toBeGreaterThanOrEqual(before);
      expect(a.createdAt).toBeLessThanOrEqual(after);
      expect(a.lastActive).toBeGreaterThanOrEqual(before);
    });
  });

  describe('executeTask', () => {
    it('should return failure when agent is terminated', async () => {
      agent.terminate();
      const result = await agent.executeTask(createTask());
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available');
    });

    it('should execute successfully for active agent', async () => {
      const result = await agent.executeTask(createTask());
      expect(result.status).toBe('completed');
      expect(result.taskId).toBe('task-1');
      expect(result.agentId).toBe('agent-1');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('should execute successfully for idle agent', async () => {
      agent.setIdle();
      const result = await agent.executeTask(createTask());
      expect(result.status).toBe('completed');
    });

    it('should call task.onExecute callback if provided', async () => {
      const onExecute = vi.fn();
      const result = await agent.executeTask(createTask({ onExecute }));
      expect(onExecute).toHaveBeenCalledOnce();
      expect(result.status).toBe('completed');
    });

    it('should return failure when onExecute throws', async () => {
      const onExecute = vi.fn().mockRejectedValue(new Error('boom'));
      const result = await agent.executeTask(createTask({ onExecute }));
      expect(result.status).toBe('failed');
      expect(result.error).toBe('boom');
    });

    it('should set status to busy during execution', async () => {
      let statusDuringExec: string | undefined;
      const onExecute = vi.fn(() => {
        statusDuringExec = agent.status;
      });
      await agent.executeTask(createTask({ onExecute }));
      expect(statusDuringExec).toBe('busy');
    });

    it('should restore active status after execution', async () => {
      await agent.executeTask(createTask());
      expect(agent.status).toBe('active');
    });

    it('should restore active status after failed execution', async () => {
      const onExecute = vi.fn().mockRejectedValue(new Error('fail'));
      await agent.executeTask(createTask({ onExecute }));
      expect(agent.status).toBe('active');
    });
  });

  describe('hasCapability', () => {
    it('should return true for existing capability', () => {
      expect(agent.hasCapability('code')).toBe(true);
    });

    it('should return false for missing capability', () => {
      expect(agent.hasCapability('deploy')).toBe(false);
    });
  });

  describe('canExecute', () => {
    it('should return true when agent has the required capability', () => {
      expect(agent.canExecute('code')).toBe(true);
      expect(agent.canExecute('test')).toBe(true);
    });

    it('should return false when agent lacks the required capability', () => {
      expect(agent.canExecute('deploy')).toBe(false);
    });

    it('should return true for unknown task types (no capability mapped)', () => {
      expect(agent.canExecute('unknown-type')).toBe(true);
    });
  });

  describe('terminate', () => {
    it('should set status to terminated', () => {
      agent.terminate();
      expect(agent.status).toBe('terminated');
    });

    it('should update lastActive', () => {
      const before = agent.lastActive;
      agent.terminate();
      expect(agent.lastActive).toBeGreaterThanOrEqual(before);
    });
  });

  describe('setIdle', () => {
    it('should transition active agent to idle', () => {
      agent.setIdle();
      expect(agent.status).toBe('idle');
    });

    it('should not transition terminated agent to idle', () => {
      agent.terminate();
      agent.setIdle();
      expect(agent.status).toBe('terminated');
    });
  });

  describe('activate', () => {
    it('should transition idle agent to active', () => {
      agent.setIdle();
      agent.activate();
      expect(agent.status).toBe('active');
    });

    it('should not activate a terminated agent', () => {
      agent.terminate();
      agent.activate();
      expect(agent.status).toBe('terminated');
    });
  });

  describe('toJSON', () => {
    it('should return a plain object with all fields', () => {
      const json = agent.toJSON();
      expect(json.id).toBe('agent-1');
      expect(json.type).toBe('coder');
      expect(json.status).toBe('active');
      expect(json.capabilities).toEqual(['code', 'test']);
      expect(json.role).toBe('worker');
    });
  });

  describe('fromConfig', () => {
    it('should create an Agent instance from config', () => {
      const a = Agent.fromConfig(createConfig({ id: 'from-config' }));
      expect(a).toBeInstanceOf(Agent);
      expect(a.id).toBe('from-config');
    });
  });
});
