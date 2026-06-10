import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Agent } from '../../src/agent-lifecycle/domain/Agent.js';
import type { AgentConfig, Task } from '../../src/shared/types/index.js';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-1',
    type: 'coder',
    capabilities: ['code', 'test'],
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentConfig> = {}): Agent {
  return new Agent(makeConfig(overrides));
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'code',
    description: 'Test task',
    priority: 'high',
    status: 'pending',
    dependencies: [],
    ...overrides,
  };
}

describe('Agent', () => {
  describe('constructor', () => {
    it('initializes with active status', () => {
      const agent = makeAgent();
      expect(agent.status).toBe('active');
    });

    it('stores id, type, and capabilities from config', () => {
      const agent = makeAgent({ id: 'a-99', type: 'reviewer', capabilities: ['review'] });
      expect(agent.id).toBe('a-99');
      expect(agent.type).toBe('reviewer');
      expect(agent.capabilities).toEqual(['review']);
    });

    it('defaults capabilities to empty array when not provided', () => {
      const agent = new Agent({ id: 'x', type: 'coder' });
      expect(agent.capabilities).toEqual([]);
    });

    it('sets createdAt and lastActive on construction', () => {
      const before = Date.now();
      const agent = makeAgent();
      const after = Date.now();
      expect(agent.createdAt).toBeGreaterThanOrEqual(before);
      expect(agent.createdAt).toBeLessThanOrEqual(after);
      expect(agent.lastActive).toBeGreaterThanOrEqual(before);
    });

    it('stores optional role and parent', () => {
      const agent = makeAgent({ role: 'leader', parent: 'parent-id' });
      expect(agent.role).toBe('leader');
      expect(agent.parent).toBe('parent-id');
    });
  });

  describe('hasCapability()', () => {
    it('returns true when capability is in the list', () => {
      const agent = makeAgent({ capabilities: ['code', 'review'] });
      expect(agent.hasCapability('code')).toBe(true);
    });

    it('returns false when capability is not in the list', () => {
      const agent = makeAgent({ capabilities: ['code'] });
      expect(agent.hasCapability('deploy')).toBe(false);
    });

    it('returns false for empty capabilities list', () => {
      const agent = makeAgent({ capabilities: [] });
      expect(agent.hasCapability('code')).toBe(false);
    });
  });

  describe('canExecute()', () => {
    it('returns true when agent has the required capability for a known task type', () => {
      const agent = makeAgent({ capabilities: ['code'] });
      expect(agent.canExecute('code')).toBe(true);
    });

    it('returns false when agent lacks the required capability for a known task type', () => {
      const agent = makeAgent({ capabilities: ['code'] });
      expect(agent.canExecute('deploy')).toBe(false);
    });

    it('returns true for unknown task types regardless of capabilities', () => {
      const agent = makeAgent({ capabilities: [] });
      expect(agent.canExecute('some-unknown-type')).toBe(true);
    });

    it('maps each known task type to its corresponding capability', () => {
      const mappings: Array<[string, string]> = [
        ['code', 'code'],
        ['test', 'test'],
        ['review', 'review'],
        ['design', 'design'],
        ['deploy', 'deploy'],
        ['refactor', 'refactor'],
        ['debug', 'debug'],
      ];
      for (const [taskType, capability] of mappings) {
        const agent = makeAgent({ capabilities: [capability] });
        expect(agent.canExecute(taskType)).toBe(true);
      }
    });
  });

  describe('status transitions', () => {
    describe('terminate()', () => {
      it('sets status to terminated from active', () => {
        const agent = makeAgent();
        agent.terminate();
        expect(agent.status).toBe('terminated');
      });

      it('sets status to terminated from idle', () => {
        const agent = makeAgent();
        agent.setIdle();
        agent.terminate();
        expect(agent.status).toBe('terminated');
      });

      it('updates lastActive on termination', () => {
        const agent = makeAgent();
        const before = Date.now();
        agent.terminate();
        expect(agent.lastActive).toBeGreaterThanOrEqual(before);
      });
    });

    describe('setIdle()', () => {
      it('transitions from active to idle', () => {
        const agent = makeAgent();
        agent.setIdle();
        expect(agent.status).toBe('idle');
      });

      it('transitions from busy to idle', () => {
        const agent = makeAgent();
        // Force busy state via executeTask (don't await — just check transition path)
        (agent as any).status = 'busy';
        agent.setIdle();
        expect(agent.status).toBe('idle');
      });

      it('is a no-op when already idle', () => {
        const agent = makeAgent();
        agent.setIdle();
        agent.setIdle();
        expect(agent.status).toBe('idle');
      });

      it('is a no-op when terminated', () => {
        const agent = makeAgent();
        agent.terminate();
        agent.setIdle();
        expect(agent.status).toBe('terminated');
      });
    });

    describe('activate()', () => {
      it('transitions from idle to active', () => {
        const agent = makeAgent();
        agent.setIdle();
        agent.activate();
        expect(agent.status).toBe('active');
      });

      it('keeps active when called on active agent', () => {
        const agent = makeAgent();
        agent.activate();
        expect(agent.status).toBe('active');
      });

      it('is a no-op when terminated', () => {
        const agent = makeAgent();
        agent.terminate();
        agent.activate();
        expect(agent.status).toBe('terminated');
      });

      it('updates lastActive when activating', () => {
        const agent = makeAgent();
        agent.setIdle();
        const before = Date.now();
        agent.activate();
        expect(agent.lastActive).toBeGreaterThanOrEqual(before);
      });
    });
  });

  describe('executeTask()', () => {
    it('returns failed result when agent is busy', async () => {
      const agent = makeAgent();
      (agent as any).status = 'busy';
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available');
      expect(result.agentId).toBe('agent-1');
    });

    it('returns failed result when agent is terminated', async () => {
      const agent = makeAgent();
      agent.terminate();
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available');
    });

    it('executes successfully and returns completed result', async () => {
      const agent = makeAgent();
      const result = await agent.executeTask(makeTask({ priority: 'high' }));
      expect(result.status).toBe('completed');
      expect(result.taskId).toBe('task-1');
      expect(result.agentId).toBe('agent-1');
      expect(typeof result.duration).toBe('number');
    });

    it('calls the task onExecute callback when provided', async () => {
      const agent = makeAgent();
      const onExecute = vi.fn().mockResolvedValue(undefined);
      const task = makeTask({ onExecute, priority: 'high' });
      await agent.executeTask(task);
      expect(onExecute).toHaveBeenCalledOnce();
    });

    it('returns to active status after successful execution', async () => {
      const agent = makeAgent();
      await agent.executeTask(makeTask({ priority: 'high' }));
      expect(agent.status).toBe('active');
    });

    it('returns failed result when onExecute throws', async () => {
      const agent = makeAgent();
      const onExecute = vi.fn().mockRejectedValue(new Error('Task exploded'));
      const task = makeTask({ onExecute, priority: 'high' });
      const result = await agent.executeTask(task);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Task exploded');
    });

    it('returns to active status even after a failed execution', async () => {
      const agent = makeAgent();
      const onExecute = vi.fn().mockRejectedValue(new Error('boom'));
      await agent.executeTask(makeTask({ onExecute, priority: 'high' }));
      expect(agent.status).toBe('active');
    });

    it('succeeds when agent is idle (not just active)', async () => {
      const agent = makeAgent();
      agent.setIdle();
      const result = await agent.executeTask(makeTask({ priority: 'high' }));
      expect(result.status).toBe('completed');
    });

    it('sets agent to busy during execution', async () => {
      const agent = makeAgent();
      let statusDuringExecution = '';
      const onExecute = vi.fn().mockImplementation(async () => {
        statusDuringExecution = agent.status;
      });
      await agent.executeTask(makeTask({ onExecute, priority: 'high' }));
      expect(statusDuringExecution).toBe('busy');
    });
  });

  describe('toJSON()', () => {
    it('serializes to a plain object with all IAgent fields', () => {
      const agent = makeAgent({ id: 'ser-1', type: 'tester', capabilities: ['test'], role: 'worker' });
      const json = agent.toJSON();
      expect(json.id).toBe('ser-1');
      expect(json.type).toBe('tester');
      expect(json.status).toBe('active');
      expect(json.capabilities).toEqual(['test']);
      expect(json.role).toBe('worker');
      expect(typeof json.createdAt).toBe('number');
      expect(typeof json.lastActive).toBe('number');
    });

    it('reflects current status after transitions', () => {
      const agent = makeAgent();
      agent.terminate();
      expect(agent.toJSON().status).toBe('terminated');
    });
  });

  describe('static fromConfig()', () => {
    it('creates an Agent instance from config', () => {
      const config = makeConfig({ id: 'fc-1', capabilities: ['deploy'] });
      const agent = Agent.fromConfig(config);
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.id).toBe('fc-1');
      expect(agent.capabilities).toEqual(['deploy']);
    });
  });
});
