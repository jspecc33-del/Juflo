import { describe, it, expect, vi } from 'vitest';
import { Task } from '../src/task-execution/domain/Task.js';
import type { Task as ITask } from '../src/shared/types/index.js';

function makeTask(overrides: Partial<ITask> = {}): Task {
  return new Task({
    id: 'task-1',
    type: 'code',
    description: 'Test task',
    priority: 'medium',
    status: 'pending',
    dependencies: [],
    ...overrides,
  });
}

describe('Task', () => {
  // ---- 1. Constructor ----
  describe('constructor', () => {
    it('sets id, type, description and priority', () => {
      const task = makeTask({ id: 't1', type: 'review', description: 'Review PR', priority: 'high' });
      expect(task.id).toBe('t1');
      expect(task.type).toBe('review');
      expect(task.description).toBe('Review PR');
      expect(task.priority).toBe('high');
    });

    it('defaults status to pending when not provided', () => {
      const task = new Task({ id: 't1', type: 'code', description: 'd', priority: 'low' });
      expect(task.status).toBe('pending');
    });

    it('uses the provided status', () => {
      const task = makeTask({ status: 'in-progress' });
      expect(task.status).toBe('in-progress');
    });

    it('defaults dependencies to empty array', () => {
      const task = new Task({ id: 't1', type: 'code', description: 'd', priority: 'low' });
      expect(task.dependencies).toEqual([]);
    });

    it('defaults metadata to empty object', () => {
      const task = new Task({ id: 't1', type: 'code', description: 'd', priority: 'low' });
      expect(task.metadata).toEqual({});
    });

    it('stores onExecute and onRollback callbacks', () => {
      const onExecute = vi.fn();
      const onRollback = vi.fn();
      const task = makeTask({ onExecute, onRollback });
      expect(task.onExecute).toBe(onExecute);
      expect(task.onRollback).toBe(onRollback);
    });
  });

  // ---- 2. areDependenciesResolved ----
  describe('areDependenciesResolved', () => {
    it('returns true when there are no dependencies', () => {
      const task = makeTask({ dependencies: [] });
      expect(task.areDependenciesResolved(new Set())).toBe(true);
    });

    it('returns true when all dependencies are in the completed set', () => {
      const task = makeTask({ dependencies: ['dep-1', 'dep-2'] });
      expect(task.areDependenciesResolved(new Set(['dep-1', 'dep-2', 'dep-3']))).toBe(true);
    });

    it('returns false when some dependencies are missing', () => {
      const task = makeTask({ dependencies: ['dep-1', 'dep-2'] });
      expect(task.areDependenciesResolved(new Set(['dep-1']))).toBe(false);
    });

    it('returns false when no dependencies are completed', () => {
      const task = makeTask({ dependencies: ['dep-1'] });
      expect(task.areDependenciesResolved(new Set())).toBe(false);
    });
  });

  // ---- 3. start ----
  describe('start', () => {
    it('transitions from pending to in-progress', () => {
      const task = makeTask({ status: 'pending' });
      task.start();
      expect(task.status).toBe('in-progress');
    });

    it('does not change status if already in-progress', () => {
      const task = makeTask({ status: 'in-progress' });
      task.start();
      expect(task.status).toBe('in-progress');
    });

    it('does not change status if completed', () => {
      const task = makeTask({ status: 'completed' });
      task.start();
      expect(task.status).toBe('completed');
    });
  });

  // ---- 4. complete ----
  describe('complete', () => {
    it('transitions from in-progress to completed', () => {
      const task = makeTask();
      task.start();
      task.complete();
      expect(task.status).toBe('completed');
    });

    it('does not change status if pending (not started)', () => {
      const task = makeTask({ status: 'pending' });
      task.complete();
      expect(task.status).toBe('pending');
    });

    it('does not change status if already completed', () => {
      const task = makeTask();
      task.start();
      task.complete();
      task.complete();
      expect(task.status).toBe('completed');
    });
  });

  // ---- 5. fail ----
  describe('fail', () => {
    it('sets status to failed from pending', () => {
      const task = makeTask({ status: 'pending' });
      task.fail();
      expect(task.status).toBe('failed');
    });

    it('sets status to failed from in-progress', () => {
      const task = makeTask();
      task.start();
      task.fail();
      expect(task.status).toBe('failed');
    });

    it('stores error message in metadata when provided', () => {
      const task = makeTask();
      task.fail('something went wrong');
      expect(task.metadata?.error).toBe('something went wrong');
    });

    it('does not throw when no error string is provided', () => {
      expect(() => makeTask().fail()).not.toThrow();
    });
  });

  // ---- 6. cancel ----
  describe('cancel', () => {
    it('cancels a pending task', () => {
      const task = makeTask({ status: 'pending' });
      task.cancel();
      expect(task.status).toBe('cancelled');
    });

    it('cancels an in-progress task', () => {
      const task = makeTask();
      task.start();
      task.cancel();
      expect(task.status).toBe('cancelled');
    });

    it('does NOT cancel a completed task', () => {
      const task = makeTask();
      task.start();
      task.complete();
      task.cancel();
      expect(task.status).toBe('completed');
    });

    it('does NOT cancel a failed task', () => {
      const task = makeTask();
      task.fail();
      task.cancel();
      expect(task.status).toBe('failed');
    });
  });

  // ---- 7. getDuration ----
  describe('getDuration', () => {
    it('returns undefined when task has not started', () => {
      expect(makeTask().getDuration()).toBeUndefined();
    });

    it('returns elapsed time while task is running', async () => {
      const task = makeTask();
      task.start();
      await new Promise(r => setTimeout(r, 10));
      expect(task.getDuration()).toBeGreaterThan(0);
    });

    it('returns a non-negative number after task completes', () => {
      const task = makeTask();
      task.start();
      task.complete();
      const duration = task.getDuration();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('returns a non-negative number after task fails', () => {
      const task = makeTask();
      task.start();
      task.fail();
      const duration = task.getDuration();
      expect(typeof duration).toBe('number');
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ---- 8. isWorkflow ----
  describe('isWorkflow', () => {
    it('returns true when type is workflow and workflow is defined', () => {
      const task = makeTask({
        type: 'workflow',
        workflow: { id: 'wf-1', name: 'My Workflow', tasks: [] },
      });
      expect(task.isWorkflow()).toBe(true);
    });

    it('returns false when type is not workflow', () => {
      expect(makeTask({ type: 'code' }).isWorkflow()).toBe(false);
    });

    it('returns false when type is workflow but workflow is undefined', () => {
      const task = makeTask({ type: 'workflow', workflow: undefined });
      expect(task.isWorkflow()).toBe(false);
    });
  });

  // ---- 9. assignTo ----
  describe('assignTo', () => {
    it('sets the assignedTo field', () => {
      const task = makeTask();
      task.assignTo('agent-42');
      expect(task.assignedTo).toBe('agent-42');
    });

    it('overwrites a previous assignment', () => {
      const task = makeTask({ assignedTo: 'agent-1' });
      task.assignTo('agent-2');
      expect(task.assignedTo).toBe('agent-2');
    });
  });

  // ---- 10. getPriorityValue ----
  describe('getPriorityValue', () => {
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

  // ---- 11. toJSON ----
  describe('toJSON', () => {
    it('returns a plain object with core fields', () => {
      const task = makeTask({ id: 'j1', type: 'test', description: 'Run tests', priority: 'high' });
      const json = task.toJSON();
      expect(json.id).toBe('j1');
      expect(json.type).toBe('test');
      expect(json.description).toBe('Run tests');
      expect(json.priority).toBe('high');
    });

    it('includes timing info in metadata after completion', () => {
      const task = makeTask();
      task.start();
      task.complete();
      const json = task.toJSON();
      expect(json.metadata).toBeDefined();
      expect(typeof (json.metadata as Record<string, unknown>)['duration']).toBe('number');
    });

    it('does not include class methods in output', () => {
      const json = makeTask().toJSON() as Record<string, unknown>;
      expect(typeof json['start']).toBe('undefined');
      expect(typeof json['complete']).toBe('undefined');
      expect(typeof json['fail']).toBe('undefined');
    });
  });

  // ---- 12. fromConfig static ----
  describe('fromConfig', () => {
    it('creates a Task instance from a config object', () => {
      const config: ITask = { id: 'fc-1', type: 'deploy', description: 'Deploy app', priority: 'high' };
      const task = Task.fromConfig(config);
      expect(task).toBeInstanceOf(Task);
      expect(task.id).toBe('fc-1');
      expect(task.type).toBe('deploy');
    });
  });

  // ---- 13. sortByPriority static ----
  describe('sortByPriority', () => {
    it('sorts high → medium → low', () => {
      const tasks = [
        makeTask({ id: 'low', priority: 'low' }),
        makeTask({ id: 'high', priority: 'high' }),
        makeTask({ id: 'med', priority: 'medium' }),
      ];
      const sorted = Task.sortByPriority(tasks);
      expect(sorted.map(t => t.id)).toEqual(['high', 'med', 'low']);
    });

    it('does not mutate the original array', () => {
      const tasks = [
        makeTask({ id: 'low', priority: 'low' }),
        makeTask({ id: 'high', priority: 'high' }),
      ];
      const firstId = tasks[0].id;
      Task.sortByPriority(tasks);
      expect(tasks[0].id).toBe(firstId);
    });

    it('handles a single-element array', () => {
      const tasks = [makeTask({ id: 'only', priority: 'high' })];
      expect(Task.sortByPriority(tasks).map(t => t.id)).toEqual(['only']);
    });

    it('handles an empty array', () => {
      expect(Task.sortByPriority([])).toEqual([]);
    });
  });

  // ---- 14. resolveExecutionOrder static ----
  describe('resolveExecutionOrder', () => {
    it('returns tasks in dependency-respecting order', () => {
      const a = makeTask({ id: 'a', dependencies: [] });
      const b = makeTask({ id: 'b', dependencies: ['a'] });
      const c = makeTask({ id: 'c', dependencies: ['b'] });
      const order = Task.resolveExecutionOrder([c, b, a]);
      const ids = order.map(t => t.id);
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
    });

    it('places higher-priority tasks first within the same dependency level', () => {
      const hi = makeTask({ id: 'hi', priority: 'high', dependencies: [] });
      const lo = makeTask({ id: 'lo', priority: 'low', dependencies: [] });
      const order = Task.resolveExecutionOrder([lo, hi]);
      expect(order[0].id).toBe('hi');
    });

    it('handles a single task with no dependencies', () => {
      const task = makeTask({ id: 'solo' });
      expect(Task.resolveExecutionOrder([task]).map(t => t.id)).toEqual(['solo']);
    });

    it('handles an empty task list', () => {
      expect(Task.resolveExecutionOrder([])).toEqual([]);
    });

    it('throws on circular dependencies', () => {
      const a = makeTask({ id: 'a', dependencies: ['b'] });
      const b = makeTask({ id: 'b', dependencies: ['a'] });
      expect(() => Task.resolveExecutionOrder([a, b])).toThrow('Circular dependency');
    });

    it('handles a diamond dependency graph (A → B, A → C, B → D, C → D)', () => {
      const a = makeTask({ id: 'a', dependencies: [] });
      const b = makeTask({ id: 'b', dependencies: ['a'] });
      const c = makeTask({ id: 'c', dependencies: ['a'] });
      const d = makeTask({ id: 'd', dependencies: ['b', 'c'] });
      const order = Task.resolveExecutionOrder([d, c, b, a]);
      const ids = order.map(t => t.id);
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('c'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('d'));
      expect(ids.indexOf('c')).toBeLessThan(ids.indexOf('d'));
    });
  });
});
