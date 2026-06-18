/**
 * Task Domain Entity
 *
 * Represents a task to be executed by agents in the V3 system.
 * Implemented as an aggregate root: status and priority are immutable
 * value objects, and state transitions raise domain events.
 */

import { AggregateRoot } from '../../shared/domain';
import { TaskId } from './value-objects/TaskId';
import { TaskStatus } from './value-objects/TaskStatus';
import { Priority } from './value-objects/Priority';
import {
  TaskStartedEvent,
  TaskAssignedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  TaskCancelledEvent
} from './events/TaskEvents';
import type {
  Task as ITask,
  TaskPriority,
  TaskStatus as TaskStatusValue,
  TaskType,
  WorkflowDefinition
} from '../../shared/types';

export class Task extends AggregateRoot<string> implements ITask {
  public readonly type: TaskType;
  public description: string;
  public assignedTo?: string;
  public dependencies: string[];
  public metadata?: Record<string, unknown>;
  public workflow?: WorkflowDefinition;
  public onExecute?: () => void | Promise<void>;
  public onRollback?: () => void | Promise<void>;

  private _priority: Priority;
  private _status: TaskStatus;
  private startedAt?: number;
  private completedAt?: number;

  constructor(config: ITask) {
    super(TaskId.create(config.id).value);
    this.type = config.type;
    this.description = config.description;
    this._priority = Priority.fromString(config.priority);
    this._status = config.status ? TaskStatus.fromString(config.status) : TaskStatus.pending();
    this.assignedTo = config.assignedTo;
    this.dependencies = config.dependencies || [];
    this.metadata = config.metadata || {};
    this.workflow = config.workflow;
    this.onExecute = config.onExecute;
    this.onRollback = config.onRollback;
  }

  get priority(): TaskPriority {
    return this._priority.value;
  }

  set priority(value: TaskPriority) {
    this._priority = Priority.fromString(value);
  }

  get status(): TaskStatusValue {
    return this._status.value;
  }

  /**
   * Check if task has all dependencies resolved
   */
  areDependenciesResolved(completedTasks: Set<string>): boolean {
    return this.dependencies.every(dep => completedTasks.has(dep));
  }

  /**
   * Mark task as started
   */
  start(): void {
    if (this._status.isPending()) {
      this._status = TaskStatus.inProgress();
      this.startedAt = Date.now();
      this.applyEvent(new TaskStartedEvent(this.id));
    }
  }

  /**
   * Mark task as completed
   */
  complete(): void {
    if (this._status.isInProgress()) {
      this._status = TaskStatus.completed();
      this.completedAt = Date.now();
      this.applyEvent(new TaskCompletedEvent(this.id, this.getDuration()));
    }
  }

  /**
   * Mark task as failed
   */
  fail(error?: string): void {
    this._status = TaskStatus.failed();
    this.completedAt = Date.now();
    if (error && this.metadata) {
      this.metadata.error = error;
    }
    this.applyEvent(new TaskFailedEvent(this.id, error));
  }

  /**
   * Cancel the task
   */
  cancel(): void {
    if (!this._status.isCompleted() && !this._status.isFailed()) {
      this._status = TaskStatus.cancelled();
      this.completedAt = Date.now();
      this.applyEvent(new TaskCancelledEvent(this.id));
    }
  }

  /**
   * Get task duration
   */
  getDuration(): number | undefined {
    if (this.startedAt && this.completedAt) {
      return this.completedAt - this.startedAt;
    }
    if (this.startedAt) {
      return Date.now() - this.startedAt;
    }
    return undefined;
  }

  /**
   * Check if task is a nested workflow
   */
  isWorkflow(): boolean {
    return this.type === 'workflow' && this.workflow !== undefined;
  }

  /**
   * Assign task to an agent
   */
  assignTo(agentId: string): void {
    this.assignedTo = agentId;
    this.applyEvent(new TaskAssignedEvent(this.id, agentId));
  }

  /**
   * Get priority as numeric value for sorting
   */
  getPriorityValue(): number {
    return this._priority.getNumericValue();
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): ITask {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      priority: this.priority,
      status: this.status,
      assignedTo: this.assignedTo,
      dependencies: this.dependencies,
      metadata: {
        ...this.metadata,
        startedAt: this.startedAt,
        completedAt: this.completedAt,
        duration: this.getDuration()
      },
      workflow: this.workflow
    };
  }

  /**
   * Create task from config
   */
  static fromConfig(config: ITask): Task {
    return new Task(config);
  }

  /**
   * Sort tasks by priority (high to low)
   */
  static sortByPriority(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => b.getPriorityValue() - a.getPriorityValue());
  }

  /**
   * Resolve task execution order based on dependencies
   */
  static resolveExecutionOrder(tasks: Task[]): Task[] {
    const resolved: Task[] = [];
    const resolvedIds = new Set<string>();
    const remaining = [...tasks];

    // Topological sort
    while (remaining.length > 0) {
      const ready = remaining.filter(task =>
        task.areDependenciesResolved(resolvedIds)
      );

      if (ready.length === 0 && remaining.length > 0) {
        throw new Error('Circular dependency detected in tasks');
      }

      // Sort ready tasks by priority
      const sorted = Task.sortByPriority(ready);

      for (const task of sorted) {
        resolved.push(task);
        resolvedIds.add(task.id);
        const index = remaining.indexOf(task);
        if (index > -1) {
          remaining.splice(index, 1);
        }
      }
    }

    return resolved;
  }
}

export { Task as default };
