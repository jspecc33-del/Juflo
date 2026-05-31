import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Agent } from '../src/agent-lifecycle/domain/Agent.js';
import type { AgentConfig, Task } from '../src/shared/types/index.js';

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-1',
    type: 'coder',
    capabilities: ['code', 'test'],
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    type: 'code',
    description: 'Write a function',
    priority: 'medium',
    status: 'pending',
    dependencies: [],
    ...overrides,
  };
}

describe('Agent', () => {
  // ---- 1. Constructor ----
  describe('constructor', () => {
    it('sets id and type from config', () => {
      const agent = new Agent(makeConfig({ id: 'a1', type: 'tester' }));
      expect(agent.id).toBe('a1');
      expect(agent.type).toBe('tester');
    });

    it('defaults status to active', () => {
      const agent = new Agent(makeConfig());
      expect(agent.status).toBe('active');
    });

    it('sets capabilities from config', () => {
      const agent = new Agent(makeConfig({ capabilities: ['code', 'review'] }));
      expect(agent.capabilities).toEqual(['code', 'review']);
    });

    it('defaults capabilities to empty array when not provided', () => {
      const agent = new Agent(makeConfig({ capabilities: undefined }));
      expect(agent.capabilities).toEqual([]);
    });

    it('defaults metadata to empty object when not provided', () => {
      const agent = new Agent(makeConfig({ metadata: undefined }));
      expect(agent.metadata).toEqual({});
    });

    it('sets role and parent from config', () => {
      const agent = new Agent(makeConfig({ role: 'worker', parent: 'parent-1' }));
      expect(agent.role).toBe('worker');
      expect(agent.parent).toBe('parent-1');
    });

    it('sets createdAt and lastActive to a current timestamp', () => {
      const before = Date.now();
      const agent = new Agent(makeConfig());
      const after = Date.now();
      expect(agent.createdAt).toBeGreaterThanOrEqual(before);
      expect(agent.createdAt).toBeLessThanOrEqual(after);
      expect(agent.lastActive).toBeGreaterThanOrEqual(before);
      expect(agent.lastActive).toBeLessThanOrEqual(after);
    });
  });

  // ---- 2. executeTask ----
  describe('executeTask', () => {
    let agent: Agent;

    beforeEach(() => {
      agent = new Agent(makeConfig());
    });

    it('returns failed result when status is busy', async () => {
      agent.status = 'busy';
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available');
    });

    it('returns failed result when status is terminated', async () => {
      agent.terminate();
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('failed');
      expect(result.error).toContain('not available');
    });

    it('returns failed result when status is error', async () => {
      agent.status = 'error';
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('failed');
    });

    it('executes successfully when status is active', async () => {
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('completed');
    });

    it('executes successfully when status is idle', async () => {
      agent.setIdle();
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('completed');
    });

    it('calls onExecute callback if provided', async () => {
      const onExecute = vi.fn().mockResolvedValue(undefined);
      await agent.executeTask(makeTask({ onExecute }));
      expect(onExecute).toHaveBeenCalledOnce();
    });

    it('sets status to busy during execution', async () => {
      let statusDuringExecution = '';
      const onExecute = vi.fn().mockImplementation(async () => {
        statusDuringExecution = agent.status;
      });
      await agent.executeTask(makeTask({ onExecute }));
      expect(statusDuringExecution).toBe('busy');
    });

    it('resets status to active after successful execution', async () => {
      await agent.executeTask(makeTask());
      expect(agent.status).toBe('active');
    });

    it('resets status to active after a thrown error', async () => {
      const onExecute = vi.fn().mockRejectedValue(new Error('boom'));
      await agent.executeTask(makeTask({ onExecute }));
      expect(agent.status).toBe('active');
    });

    it('returns failed result when onExecute throws an Error', async () => {
      const onExecute = vi.fn().mockRejectedValue(new Error('task error'));
      const result = await agent.executeTask(makeTask({ onExecute }));
      expect(result.status).toBe('failed');
      expect(result.error).toBe('task error');
    });

    it('stringifies non-Error thrown values', async () => {
      const onExecute = vi.fn().mockRejectedValue('string error');
      const result = await agent.executeTask(makeTask({ onExecute }));
      expect(result.status).toBe('failed');
      expect(result.error).toBe('string error');
    });

    it('result includes the correct taskId and agentId', async () => {
      const result = await agent.executeTask(makeTask({ id: 'task-xyz' }));
      expect(result.taskId).toBe('task-xyz');
      expect(result.agentId).toBe('agent-1');
    });

    it('result includes a numeric duration', async () => {
      const result = await agent.executeTask(makeTask());
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it('updates lastActive after execution', async () => {
      const before = agent.lastActive;
      await new Promise(r => setTimeout(r, 5));
      await agent.executeTask(makeTask({ priority: 'high' }));
      expect(agent.lastActive).toBeGreaterThan(before);
    });
  });

  // ---- 3. hasCapability ----
  describe('hasCapability', () => {
    it('returns true for a present capability', () => {
      const agent = new Agent(makeConfig({ capabilities: ['code', 'test'] }));
      expect(agent.hasCapability('code')).toBe(true);
    });

    it('returns false for a missing capability', () => {
      const agent = new Agent(makeConfig({ capabilities: ['code'] }));
      expect(agent.hasCapability('deploy')).toBe(false);
    });

    it('returns false when capabilities array is empty', () => {
      const agent = new Agent(makeConfig({ capabilities: [] }));
      expect(agent.hasCapability('code')).toBe(false);
    });
  });

  // ---- 4. canExecute ----
  describe('canExecute', () => {
    it('returns true for code task when agent has code capability', () => {
      const agent = new Agent(makeConfig({ capabilities: ['code'] }));
      expect(agent.canExecute('code')).toBe(true);
    });

    it('returns false for code task when agent lacks code capability', () => {
      const agent = new Agent(makeConfig({ capabilities: ['test'] }));
      expect(agent.canExecute('code')).toBe(false);
    });

    it('returns true for test task when agent has test capability', () => {
      const agent = new Agent(makeConfig({ capabilities: ['test'] }));
      expect(agent.canExecute('test')).toBe(true);
    });

    it('returns true for review task when agent has review capability', () => {
      const agent = new Agent(makeConfig({ capabilities: ['review'] }));
      expect(agent.canExecute('review')).toBe(true);
    });

    it('returns true for an unknown task type regardless of capabilities', () => {
      const agent = new Agent(makeConfig({ capabilities: [] }));
      expect(agent.canExecute('unknown-type')).toBe(true);
    });

    it('maps all known task types to their capability correctly', () => {
      const taskTypes = ['code', 'test', 'review', 'design', 'deploy', 'refactor', 'debug'];
      for (const type of taskTypes) {
        const agent = new Agent(makeConfig({ capabilities: [type] }));
        expect(agent.canExecute(type)).toBe(true);
      }
    });
  });

  // ---- 5. terminate ----
  describe('terminate', () => {
    it('sets status to terminated', () => {
      const agent = new Agent(makeConfig());
      agent.terminate();
      expect(agent.status).toBe('terminated');
    });

    it('updates lastActive on termination', async () => {
      const agent = new Agent(makeConfig());
      const before = agent.lastActive;
      await new Promise(r => setTimeout(r, 5));
      agent.terminate();
      expect(agent.lastActive).toBeGreaterThan(before);
    });

    it('can be called from active, idle, or busy status', () => {
      for (const status of ['active', 'idle', 'busy'] as const) {
        const agent = new Agent(makeConfig());
        agent.status = status;
        agent.terminate();
        expect(agent.status).toBe('terminated');
      }
    });
  });

  // ---- 6. setIdle ----
  describe('setIdle', () => {
    it('transitions from active to idle', () => {
      const agent = new Agent(makeConfig());
      agent.setIdle();
      expect(agent.status).toBe('idle');
    });

    it('transitions from busy to idle', () => {
      const agent = new Agent(makeConfig());
      agent.status = 'busy';
      agent.setIdle();
      expect(agent.status).toBe('idle');
    });

    it('does NOT transition from terminated to idle', () => {
      const agent = new Agent(makeConfig());
      agent.terminate();
      agent.setIdle();
      expect(agent.status).toBe('terminated');
    });

    it('updates lastActive when transitioning', async () => {
      const agent = new Agent(makeConfig());
      const before = agent.lastActive;
      await new Promise(r => setTimeout(r, 5));
      agent.setIdle();
      expect(agent.lastActive).toBeGreaterThan(before);
    });
  });

  // ---- 7. activate ----
  describe('activate', () => {
    it('transitions from idle to active', () => {
      const agent = new Agent(makeConfig());
      agent.setIdle();
      agent.activate();
      expect(agent.status).toBe('active');
    });

    it('transitions from busy to active', () => {
      const agent = new Agent(makeConfig());
      agent.status = 'busy';
      agent.activate();
      expect(agent.status).toBe('active');
    });

    it('does NOT transition from terminated to active', () => {
      const agent = new Agent(makeConfig());
      agent.terminate();
      agent.activate();
      expect(agent.status).toBe('terminated');
    });

    it('updates lastActive when activating', async () => {
      const agent = new Agent(makeConfig());
      agent.setIdle();
      const before = agent.lastActive;
      await new Promise(r => setTimeout(r, 5));
      agent.activate();
      expect(agent.lastActive).toBeGreaterThan(before);
    });
  });

  // ---- 8. toJSON ----
  describe('toJSON', () => {
    it('returns a plain object with all expected fields', () => {
      const agent = new Agent(makeConfig({
        id: 'j1', type: 'reviewer', capabilities: ['review'], role: 'worker', parent: 'p1',
      }));
      const json = agent.toJSON();
      expect(json.id).toBe('j1');
      expect(json.type).toBe('reviewer');
      expect(json.status).toBe('active');
      expect(json.capabilities).toEqual(['review']);
      expect(json.role).toBe('worker');
      expect(json.parent).toBe('p1');
      expect(typeof json.createdAt).toBe('number');
      expect(typeof json.lastActive).toBe('number');
    });

    it('does not include class methods in the output', () => {
      const agent = new Agent(makeConfig());
      const json = agent.toJSON() as Record<string, unknown>;
      expect(typeof json['executeTask']).toBe('undefined');
      expect(typeof json['terminate']).toBe('undefined');
      expect(typeof json['setIdle']).toBe('undefined');
    });
  });

  // ---- 9. fromConfig static ----
  describe('fromConfig', () => {
    it('creates an Agent instance from a config object', () => {
      const config = makeConfig({ id: 'fc-1', type: 'designer' });
      const agent = Agent.fromConfig(config);
      expect(agent).toBeInstanceOf(Agent);
      expect(agent.id).toBe('fc-1');
      expect(agent.type).toBe('designer');
    });
  });

  // ---- 10. State machine completeness ----
  describe('state machine', () => {
    it('full lifecycle: active → busy(task) → active → idle → active → terminated', async () => {
      const agent = new Agent(makeConfig());
      expect(agent.status).toBe('active');

      await agent.executeTask(makeTask({ priority: 'high' })); // active → busy → active
      expect(agent.status).toBe('active');

      agent.setIdle();    // → idle
      expect(agent.status).toBe('idle');

      agent.activate();   // → active
      expect(agent.status).toBe('active');

      agent.terminate();  // → terminated
      expect(agent.status).toBe('terminated');
    });

    it('terminated agent cannot execute tasks', async () => {
      const agent = new Agent(makeConfig());
      agent.terminate();
      const result = await agent.executeTask(makeTask());
      expect(result.status).toBe('failed');
    });

    it('terminated agent cannot be reactivated', () => {
      const agent = new Agent(makeConfig());
      agent.terminate();
      agent.activate();
      expect(agent.status).toBe('terminated');
    });

    it('terminated agent cannot be set to idle', () => {
      const agent = new Agent(makeConfig());
      agent.terminate();
      agent.setIdle();
      expect(agent.status).toBe('terminated');
    });
  });
});
