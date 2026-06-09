/**
 * WorkflowExecutor — Domain Service
 *
 * Core workflow execution loop: dependency resolution, task dispatch, rollback.
 * Extracted from WorkflowEngine per DDD bounded-context decomposition.
 */

import { Task } from './Task';
import { WorkflowObserver } from './WorkflowObserver';
import type {
  Task as ITask,
  TaskResult,
  WorkflowDefinition,
  WorkflowResult,
  WorkflowState
} from '../../shared/types';

export interface TaskExecutionPort {
  executeTask(task: ITask, agentId: string): Promise<TaskResult>;
  getAvailableAgentFor(taskType: string): Promise<string | undefined>;
  listAgents(): Promise<Array<{ id: string; canExecute: (t: string) => boolean }>>;
}

export class WorkflowExecutor {
  constructor(private port: TaskExecutionPort) {}

  async run(
    state: WorkflowState,
    workflow: WorkflowDefinition,
    observer: WorkflowObserver
  ): Promise<WorkflowResult> {
    const tasks = workflow.tasks.map(t => new Task(t));
    const ordered = Task.resolveExecutionOrder(tasks);
    const completed = new Set<string>();
    const errors: Error[] = [];

    for (const task of ordered) {
      while (state.status === 'paused') {
        await new Promise(r => setTimeout(r, 100));
      }
      if (state.status === 'cancelled') break;

      state.currentTask = task.id;
      const start = observer.recordTaskStart(task.id);

      try {
        if (task.isWorkflow() && task.workflow) {
          const nested = await this.runNested(task.workflow, observer);
          if (nested.status === 'failed') throw new Error('Nested workflow failed');
        } else {
          const agentId = task.assignedTo ?? await this.port.getAvailableAgentFor(task.type);
          if (!agentId) throw new Error(`No agent available for task ${task.id}`);

          const result = await this.port.executeTask(task, agentId);
          if (result.status === 'failed') throw new Error(result.error ?? 'Task failed');
        }

        observer.recordTaskEnd(task.id, start);
        completed.add(task.id);
        state.completedTasks.push(task.id);
        observer.logEvent('task:completed', { taskId: task.id });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push(error);
        observer.logEvent('task:failed', { taskId: task.id, error: error.message });
        if (workflow.rollbackOnFailure) throw error;
      }
    }

    const endTime = Date.now();
    state.status = errors.length > 0 ? 'failed' : 'completed';
    state.completedAt = endTime;

    return {
      id: workflow.id,
      status: state.status as 'completed' | 'failed',
      tasksCompleted: completed.size,
      errors,
      executionOrder: observer.getSnapshot().executionOrder,
      duration: endTime - (state.startedAt ?? endTime),
    };
  }

  async rollback(
    completedTaskIds: string[],
    workflow: WorkflowDefinition,
    observer: WorkflowObserver
  ): Promise<void> {
    for (const taskId of [...completedTaskIds].reverse()) {
      const task = workflow.tasks.find(t => t.id === taskId);
      if (!task?.onRollback) continue;
      try {
        await task.onRollback();
        observer.logEvent('task:rolledback', { taskId });
      } catch (err) {
        observer.logEvent('rollback:error', { taskId, error: String(err) });
      }
    }
  }

  private async runNested(
    nested: WorkflowDefinition,
    _observer: WorkflowObserver
  ): Promise<WorkflowResult> {
    const nestedState: WorkflowState = {
      id: nested.id,
      name: nested.name,
      tasks: nested.tasks,
      status: 'in-progress',
      completedTasks: [],
      startedAt: Date.now(),
    };
    const nestedObserver = new WorkflowObserver();
    return this.run(nestedState, nested, nestedObserver);
  }
}
