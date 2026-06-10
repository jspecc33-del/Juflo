/**
 * TaskDistributor — Domain Service
 *
 * Load-balances tasks across available agents.
 * Extracted from SwarmCoordinator per DDD bounded-context decomposition.
 */

import { Agent } from '../../agent-lifecycle/domain/Agent';
import { Task } from '../../task-execution/domain/Task';
import type { Task as ITask, TaskAssignment } from '../../shared/types';

export class TaskDistributor {
  /**
   * Assign tasks to agents using least-loaded balancing.
   * Only considers agents that are active and capable of the task type.
   */
  distribute(tasks: ITask[], agents: Agent[]): TaskAssignment[] {
    const assignments: TaskAssignment[] = [];
    const loads = new Map<string, number>(agents.map(a => [a.id, 0]));
    const sorted = Task.sortByPriority(tasks.map(t => new Task(t)));

    for (const task of sorted) {
      const candidates = agents.filter(
        a => a.canExecute(task.type) && a.status === 'active'
      );
      if (candidates.length === 0) continue;

      const best = candidates.reduce((prev, curr) =>
        (loads.get(curr.id) ?? 0) < (loads.get(prev.id) ?? 0) ? curr : prev
      );

      assignments.push({
        taskId: task.id,
        agentId: best.id,
        assignedAt: Date.now(),
        priority: task.priority,
      });
      loads.set(best.id, (loads.get(best.id) ?? 0) + 1);
    }

    return assignments;
  }

  /**
   * Resolve task execution order respecting dependencies.
   */
  resolveOrder(tasks: ITask[]): ITask[] {
    return Task.resolveExecutionOrder(tasks.map(t => new Task(t)));
  }
}
