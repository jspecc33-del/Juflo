/**
 * Unit Tests: Task Domain Entity
 *
 * Tests for task lifecycle, dependency resolution, priority sorting, and serialization.
 */

import { describe, it, expect, vi } from 'vitest';
import { Task } from '../../src/task-execution/domain/Task';
import type { Task as ITask } from '../../src/shared/types';

function createTaskConfig(overrides: Partial<ITask> = {}): ITask {
  return {
    id: 'task-1',
    type: 'code',
    description: 'Implement feature',
    priority: 'medium',
    ...overrides,
  };
}

describe('Task', () => {
  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const task = new Task(createTaskConfig());
      expect(task.id).toBe('task-1');
      expect(task.type).toBe('code');
      expect(task.description).toBe('Implement feature');
      expect(task.priority).toBe('medium');
      expect(task.status).toBe('pending');
    });

    it('should default dependencies to empty array', () => {
      const task = new Task(createTaskConfig());
      expect(task.dependencies).toEqual([]);
    });

    it('should default metadata to empty object', () => {
      const task = new Task(createTaskConfig());
      expect(task.metadata).toEqual({});
    });

    it('should use provided status', () => {
      const task = new Task(createTaskConfig({ status: 'in-progress' }));
      expect(task.status).toBe('in-progress');
    });
  });

  describe('areDependenciesResolved', () => {
    it('should return true when no dependencies', () => {
      const task = new Task(createTaskConfig());
      expect(task.areDependenciesResolved(new Set())).toBe(true);
    });

    it('should return true when all dependencies are completed', () => {
      const task = new Task(createTaskConfig({ dependencies: ['dep-1', 'dep-2'] }));
      expect(task.areDependenciesResolved(new Set(['dep-1', 'dep-2']))).toBe(true);
    });

    it('should return false when some dependencies are missing', () => {
      const task = new Task(createTaskConfig({ dependencies: ['dep-1', 'dep-2'] }));
      expect(task.areDependenciesResolved(new Set(['dep-1']))).toBe(false);
    });
  });

  describe('start', () => {
    it('should transition pending task to in-progress', () => {
      const task = new Task(createTaskConfig());
      task.start();
      expect(task.status).toBe('in-progress');
    });

    it('should not transition non-pending task', () => {
      const task = new Task(createTaskConfig({ status: 'completed' }));
      task.start();
      expect(task.status).toBe('completed');
    });
  });

  describe('complete', () => {
    it('should transition in-progress task to completed', () => {
      const task = new Task(createTaskConfig());
      task.start();
      task.complete();
      expect(task.status).toBe('completed');
    });

    it('should not transition pending task to completed', () => {
      const task = new Task(createTaskConfig());
      task.complete();
      expect(task.status).toBe('pending');
    });
  });

  describe('fail', () => {
    it('should set status to failed', () => {
      const task = new Task(createTaskConfig());
      task.fail('something broke');
      expect(task.status).toBe('failed');
    });

    it('should store error message in metadata', () => {
      const task = new Task(createTaskConfig());
      task.fail('something broke');
      expect(task.metadata?.error).toBe('something broke');
    });
  });

  describe('cancel', () => {
    it('should cancel a pending task', () => {
      const task = new Task(createTaskConfig());
      task.cancel();
      expect(task.status).toBe('cancelled');
    });

    it('should cancel an in-progress task', () => {
      const task = new Task(createTaskConfig());
      task.start();
      task.cancel();
      expect(task.status).toBe('cancelled');
    });

    it('should not cancel a completed task', () => {
      const task = new Task(createTaskConfig());
      task.start();
      task.complete();
      task.cancel();
      expect(task.status).toBe('completed');
    });

    it('should not cancel a failed task', () => {
      const task = new Task(createTaskConfig());
      task.fail();
      task.cancel();
      expect(task.status).toBe('failed');
    });
  });

  describe('getDuration', () => {
    it('should return undefined for tasks that have not started', () => {
      const task = new Task(createTaskConfig());
      expect(task.getDuration()).toBeUndefined();
    });

    it('should return duration for completed tasks', () => {
      const task = new Task(createTaskConfig());
      task.start();
      task.complete();
      const duration = task.getDuration();
      expect(duration).toBeDefined();
      expect(duration).toBeGreaterThanOrEqual(0);
    });

    it('should return elapsed time for in-progress tasks', () => {
      const task = new Task(createTaskConfig());
      task.start();
      const duration = task.getDuration();
      expect(duration).toBeDefined();
      expect(duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('isWorkflow', () => {
    it('should return false for regular tasks', () => {
      const task = new Task(createTaskConfig());
      expect(task.isWorkflow()).toBe(false);
    });

    it('should return true for workflow tasks with definition', () => {
      const task = new Task(createTaskConfig({
        type: 'workflow',
        workflow: { id: 'wf-1', name: 'Test WF', tasks: [] },
      }));
      expect(task.isWorkflow()).toBe(true);
    });
  });

  describe('assignTo', () => {
    it('should set assignedTo field', () => {
      const task = new Task(createTaskConfig());
      task.assignTo('agent-1');
      expect(task.assignedTo).toBe('agent-1');
    });
  });

  describe('getPriorityValue', () => {
    it('should return 3 for high priority', () => {
      const task = new Task(createTaskConfig({ priority: 'high' }));
      expect(task.getPriorityValue()).toBe(3);
    });

    it('should return 2 for medium priority', () => {
      const task = new Task(createTaskConfig({ priority: 'medium' }));
      expect(task.getPriorityValue()).toBe(2);
    });

    it('should return 1 for low priority', () => {
      const task = new Task(createTaskConfig({ priority: 'low' }));
      expect(task.getPriorityValue()).toBe(1);
    });
  });

  describe('toJSON', () => {
    it('should serialize to plain object', () => {
      const task = new Task(createTaskConfig());
      const json = task.toJSON();
      expect(json.id).toBe('task-1');
      expect(json.type).toBe('code');
      expect(json.priority).toBe('medium');
      expect(json.metadata).toBeDefined();
    });
  });

  describe('fromConfig', () => {
    it('should create a Task from config', () => {
      const task = Task.fromConfig(createTaskConfig({ id: 'from-cfg' }));
      expect(task).toBeInstanceOf(Task);
      expect(task.id).toBe('from-cfg');
    });
  });

  describe('sortByPriority', () => {
    it('should sort tasks high > medium > low', () => {
      const tasks = [
        new Task(createTaskConfig({ id: 'low', priority: 'low' })),
        new Task(createTaskConfig({ id: 'high', priority: 'high' })),
        new Task(createTaskConfig({ id: 'med', priority: 'medium' })),
      ];
      const sorted = Task.sortByPriority(tasks);
      expect(sorted[0].id).toBe('high');
      expect(sorted[1].id).toBe('med');
      expect(sorted[2].id).toBe('low');
    });
  });

  describe('resolveExecutionOrder', () => {
    it('should return tasks in dependency order', () => {
      const tasks = [
        new Task(createTaskConfig({ id: 'c', dependencies: ['b'], priority: 'high' })),
        new Task(createTaskConfig({ id: 'a', dependencies: [], priority: 'low' })),
        new Task(createTaskConfig({ id: 'b', dependencies: ['a'], priority: 'medium' })),
      ];
      const order = Task.resolveExecutionOrder(tasks);
      const ids = order.map(t => t.id);
      expect(ids.indexOf('a')).toBeLessThan(ids.indexOf('b'));
      expect(ids.indexOf('b')).toBeLessThan(ids.indexOf('c'));
    });

    it('should throw on circular dependencies', () => {
      const tasks = [
        new Task(createTaskConfig({ id: 'a', dependencies: ['b'] })),
        new Task(createTaskConfig({ id: 'b', dependencies: ['a'] })),
      ];
      expect(() => Task.resolveExecutionOrder(tasks)).toThrow('Circular dependency');
    });
  });
});
