import { describe, it, expect, beforeEach } from 'vitest';
import { Task } from '../../src/task-execution/domain/Task.js';
import type { Task as ITask } from '../../src/shared/types/index.js';

function makeTaskConfig(overrides: Partial<ITask> = {}): ITask {
  return {
    id: 'task-1',
    type: 'code',
    description: 'Test task',
    priority: 'medium',
    status: 'pending',
    dependencies: [],
    ...overrides,
  };
}

function makeTask(overrides: Partial<ITask> = {}): Task {
  return new Task(makeTaskConfig(overrides));
}

describe('Task', () => {
  describe('constructor', () => {
    it('uses provided status', () => {
      const task = makeTask({ status: 'in-progress' });
      expect(task.status).toBe('in-progress');
    });

    it('defaults status to pending when not provided', () => {
      const task = new Task({ id: 't1', type: 'code', description: 'x', priority: 'low' } as ITask);
      expect(task.status).toBe('pending');
    });

    it('defaults dependencies to empty array', () => {
      const task = new Task({ id: 't1', type: 'code', description: 'x', priority: 'low' } as ITask);
      expect(task.dependencies).toEqual([]);
    });

    it('stores all provided config values', () => {
      const task = makeTask({ id: 'abc', type: 'test', description: 'run tests', priority: 'high' });
      expect(task.id).toBe('abc');
      expect(task.type).toBe('test');
      expect(task.description).toBe('run tests');
      expect(task.priority).toBe('high');
    });
  });

  describe('areDependenciesResolved', () => {
    it('returns true when there are no dependencies', () => {
      const task = makeTask({ dependencies: [] });
      expect(task.areDependenciesResolved(new Set())).toBe(true);
    });

    it('returns true when all dependencies are in completed set', () => {
      const task = makeTask({ dependencies: ['dep-1', 'dep-2'] });
      expect(task.areDependenciesResolved(new Set(['dep-1', 'dep-2']))).toBe(true);
    });

    it('returns false when some dependencies are missing', () => {
      const task = makeTask({ dependencies: ['dep-1', 'dep-2'] });
      expect(task.areDependenciesResolved(new Set(['dep-1']))).toBe(false);
    });

    it('returns false when no dependencies are resolved', () => {
      const task = makeTask({ dependencies: ['dep-1'] });
      expect(task.areDependenciesResolved(new Set())).toBe(false);
    });
  });

  describe('state machine', () => {
    describe('start()', () => {
      it('transitions from pending to in-progress', () => {
        const task = makeTask({ status: 'pending' });
        task.start();
        expect(task.status).toBe('in-progress');
      });

      it('is a no-op when status is not pending', () => {
        const task = makeTask({ status: 'completed' });
        task.start();
        expect(task.status).toBe('completed');
      });

      it('is a no-op when already in-progress', () => {
        const task = makeTask({ status: 'in-progress' });
        task.start();
        expect(task.status).toBe('in-progress');
      });
    });

    describe('complete()', () => {
      it('transitions from in-progress to completed', () => {
        const task = makeTask({ status: 'in-progress' });
        task.complete();
        expect(task.status).toBe('completed');
      });

      it('is a no-op when status is not in-progress', () => {
        const task = makeTask({ status: 'pending' });
        task.complete();
        expect(task.status).toBe('pending');
      });
    });

    describe('fail()', () => {
      it('sets status to failed from any state', () => {
        const task = makeTask({ status: 'in-progress' });
        task.fail();
        expect(task.status).toBe('failed');
      });

      it('records error message in metadata', () => {
        const task = makeTask({ status: 'in-progress', metadata: {} });
        task.fail('Something went wrong');
        expect(task.metadata?.error).toBe('Something went wrong');
      });

      it('sets failed even from pending', () => {
        const task = makeTask({ status: 'pending' });
        task.fail();
        expect(task.status).toBe('failed');
      });
    });

    describe('cancel()', () => {
      it('cancels a pending task', () => {
        const task = makeTask({ status: 'pending' });
        task.cancel();
        expect(task.status).toBe('cancelled');
      });

      it('cancels an in-progress task', () => {
        const task = makeTask({ status: 'in-progress' });
        task.cancel();
        expect(task.status).toBe('cancelled');
      });

      it('cannot cancel a completed task', () => {
        const task = makeTask({ status: 'completed' });
        task.cancel();
        expect(task.status).toBe('completed');
      });

      it('cannot cancel a failed task', () => {
        const task = makeTask({ status: 'failed' });
        task.cancel();
        expect(task.status).toBe('failed');
      });
    });
  });

  describe('getDuration()', () => {
    it('returns undefined before starting', () => {
      const task = makeTask();
      expect(task.getDuration()).toBeUndefined();
    });

    it('returns elapsed time while in-progress', () => {
      const task = makeTask();
      task.start();
      const duration = task.getDuration();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('returns fixed duration after completion', () => {
      const task = makeTask();
      task.start();
      task.complete();
      const d1 = task.getDuration();
      const d2 = task.getDuration();
      expect(d1).toBe(d2);
    });
  });

  describe('isWorkflow()', () => {
    it('returns true when type is workflow and workflow is defined', () => {
      const task = makeTask({
        type: 'workflow',
        workflow: { id: 'wf-1', name: 'My workflow', tasks: [] },
      });
      expect(task.isWorkflow()).toBe(true);
    });

    it('returns false when type is workflow but no workflow definition', () => {
      const task = makeTask({ type: 'workflow' });
      expect(task.isWorkflow()).toBe(false);
    });

    it('returns false when workflow is set but type is not workflow', () => {
      const task = makeTask({
        type: 'code',
        workflow: { id: 'wf-1', name: 'My workflow', tasks: [] },
      });
      expect(task.isWorkflow()).toBe(false);
    });
  });

  describe('getPriorityValue()', () => {
    it('returns 3 for high priority', () => {
      expect(makeTask({ priority: 'high' }).getPriorityValue()).toBe(3);
    });

    it('returns 2 for medium priority', () => {
      expect(makeTask({ priority: 'medium' }).getPriorityValue()).toBe(2);
    });

    it('returns 1 for low priority', () => {
      expect(makeTask({ priority: 'low' }).getPriorityValue()).toBe(1);
    });
  });

  describe('assignTo()', () => {
    it('sets the assignedTo field', () => {
      const task = makeTask();
      task.assignTo('agent-42');
      expect(task.assignedTo).toBe('agent-42');
    });
  });

  describe('toJSON()', () => {
    it('includes all core fields', () => {
      const task = makeTask({ id: 'tj1', type: 'review', description: 'code review', priority: 'high' });
      const json = task.toJSON();
      expect(json.id).toBe('tj1');
      expect(json.type).toBe('review');
      expect(json.description).toBe('code review');
      expect(json.priority).toBe('high');
    });

    it('includes startedAt and completedAt in metadata after full lifecycle', () => {
      const task = makeTask();
      task.start();
      task.complete();
      const json = task.toJSON();
      expect(json.metadata?.startedAt).toBeDefined();
      expect(json.metadata?.completedAt).toBeDefined();
      expect(typeof json.metadata?.duration).toBe('number');
    });
  });

  describe('static fromConfig()', () => {
    it('creates a Task instance from config', () => {
      const config = makeTaskConfig({ id: 'from-config', priority: 'high' });
      const task = Task.fromConfig(config);
      expect(task).toBeInstanceOf(Task);
      expect(task.id).toBe('from-config');
    });
  });

  describe('static sortByPriority()', () => {
    it('sorts tasks from high to low priority', () => {
      const low = makeTask({ id: 'low', priority: 'low' });
      const high = makeTask({ id: 'high', priority: 'high' });
      const med = makeTask({ id: 'med', priority: 'medium' });
      const sorted = Task.sortByPriority([low, high, med]);
      expect(sorted.map((t) => t.id)).toEqual(['high', 'med', 'low']);
    });

    it('does not mutate the original array', () => {
      const tasks = [makeTask({ id: 'a', priority: 'low' }), makeTask({ id: 'b', priority: 'high' })];
      const original = [...tasks];
      Task.sortByPriority(tasks);
      expect(tasks[0].id).toBe(original[0].id);
    });
  });

  describe('static resolveExecutionOrder()', () => {
    it('returns empty array for no tasks', () => {
      expect(Task.resolveExecutionOrder([])).toEqual([]);
    });

    it('returns a single task with no dependencies', () => {
      const task = makeTask({ id: 'solo' });
      const order = Task.resolveExecutionOrder([task]);
      expect(order).toHaveLength(1);
      expect(order[0].id).toBe('solo');
    });

    it('resolves a linear dependency chain in order', () => {
      const a = makeTask({ id: 'a', dependencies: [] });
      const b = makeTask({ id: 'b', dependencies: ['a'] });
      const c = makeTask({ id: 'c', dependencies: ['b'] });
      const order = Task.resolveExecutionOrder([c, b, a]);
      expect(order.map((t) => t.id)).toEqual(['a', 'b', 'c']);
    });

    it('places higher priority tasks before lower priority ones at the same level', () => {
      const a = makeTask({ id: 'a', dependencies: [] });
      const highB = makeTask({ id: 'b-high', dependencies: ['a'], priority: 'high' });
      const lowC = makeTask({ id: 'c-low', dependencies: ['a'], priority: 'low' });
      const order = Task.resolveExecutionOrder([lowC, a, highB]);
      const ids = order.map((t) => t.id);
      expect(ids[0]).toBe('a');
      expect(ids[1]).toBe('b-high');
      expect(ids[2]).toBe('c-low');
    });

    it('resolves a diamond dependency (A→B, A→C, B→D, C→D)', () => {
      const a = makeTask({ id: 'A', dependencies: [] });
      const b = makeTask({ id: 'B', dependencies: ['A'], priority: 'high' });
      const c = makeTask({ id: 'C', dependencies: ['A'], priority: 'low' });
      const d = makeTask({ id: 'D', dependencies: ['B', 'C'] });
      const order = Task.resolveExecutionOrder([d, c, b, a]);
      const ids = order.map((t) => t.id);
      expect(ids[0]).toBe('A');
      expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
      expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
      expect(ids[ids.length - 1]).toBe('D');
    });

    it('throws on circular dependency', () => {
      const a = makeTask({ id: 'a', dependencies: ['b'] });
      const b = makeTask({ id: 'b', dependencies: ['a'] });
      expect(() => Task.resolveExecutionOrder([a, b])).toThrow(
        'Circular dependency detected in tasks'
      );
    });

    it('throws on self-dependency', () => {
      const a = makeTask({ id: 'a', dependencies: ['a'] });
      expect(() => Task.resolveExecutionOrder([a])).toThrow(
        'Circular dependency detected in tasks'
      );
    });
  });
});
