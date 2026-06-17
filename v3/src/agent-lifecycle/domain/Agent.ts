/**
 * Agent Domain Entity
 *
 * Represents an AI agent in the V3 system. Implemented as an aggregate
 * root: status is an immutable value object, and lifecycle/task
 * transitions raise domain events.
 */

import { AggregateRoot } from '../../shared/domain';
import { AgentId } from './value-objects/AgentId';
import { AgentStatus } from './value-objects/AgentStatus';
import {
  AgentActivatedEvent,
  AgentIdledEvent,
  AgentTerminatedEvent,
  AgentTaskStartedEvent,
  AgentTaskCompletedEvent,
  AgentTaskFailedEvent
} from './events/AgentEvents';
import type {
  Agent as IAgent,
  AgentConfig,
  AgentStatus as AgentStatusValue,
  AgentType,
  AgentRole,
  Task,
  TaskResult
} from '../../shared/types';

export class Agent extends AggregateRoot<string> implements IAgent {
  public readonly type: AgentType;
  public capabilities: string[];
  public role?: AgentRole;
  public parent?: string;
  public metadata?: Record<string, unknown>;
  public createdAt: number;
  public lastActive: number;

  private _status: AgentStatus;

  constructor(config: AgentConfig) {
    super(AgentId.create(config.id).value);
    this.type = config.type;
    this._status = AgentStatus.active();
    this.capabilities = config.capabilities || [];
    this.role = config.role;
    this.parent = config.parent;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
    this.lastActive = Date.now();
  }

  get status(): AgentStatusValue {
    return this._status.value;
  }

  /**
   * Execute a task assigned to this agent
   */
  async executeTask(task: Task): Promise<TaskResult> {
    if (!this._status.isAvailable()) {
      return {
        taskId: task.id,
        status: 'failed',
        error: `Agent ${this.id} is not available (status: ${this.status})`,
        agentId: this.id
      };
    }

    const startTime = Date.now();
    this._status = AgentStatus.busy();
    this.lastActive = startTime;
    this.applyEvent(new AgentTaskStartedEvent(this.id, task.id));

    try {
      // Execute task-specific callback if provided
      if (task.onExecute) {
        await task.onExecute();
      }

      // Process task with minimal overhead (actual work done via onExecute callback)
      await this.processTaskExecution(task);

      const duration = Date.now() - startTime;
      this._status = AgentStatus.active();
      this.lastActive = Date.now();
      this.applyEvent(new AgentTaskCompletedEvent(this.id, task.id, duration));

      return {
        taskId: task.id,
        status: 'completed',
        result: `Task ${task.id} completed successfully`,
        duration,
        agentId: this.id
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this._status = AgentStatus.active();
      const message = error instanceof Error ? error.message : String(error);
      this.applyEvent(new AgentTaskFailedEvent(this.id, task.id, message));

      return {
        taskId: task.id,
        status: 'failed',
        error: message,
        duration,
        agentId: this.id
      };
    }
  }

  /**
   * Execute task processing with priority-based timing
   * In production, the actual work is done via task.onExecute() callback
   * This method provides minimal overhead processing time
   */
  private async processTaskExecution(task: Task): Promise<void> {
    // Minimal processing overhead based on priority
    // Actual task work is performed by onExecute callback
    const processingTime: Record<string, number> = {
      high: 1,
      medium: 5,
      low: 10
    };
    const overhead = processingTime[task.priority] || 5;
    await new Promise(resolve => setTimeout(resolve, overhead));
  }

  /**
   * Check if agent has a specific capability
   */
  hasCapability(capability: string): boolean {
    return this.capabilities.includes(capability);
  }

  /**
   * Check if agent can execute a task type
   */
  canExecute(taskType: string): boolean {
    const typeToCapability: Record<string, string> = {
      code: 'code',
      test: 'test',
      review: 'review',
      design: 'design',
      deploy: 'deploy',
      refactor: 'refactor',
      debug: 'debug'
    };

    const requiredCapability = typeToCapability[taskType];
    return requiredCapability ? this.hasCapability(requiredCapability) : true;
  }

  /**
   * Terminate the agent
   */
  terminate(): void {
    this._status = AgentStatus.terminated();
    this.lastActive = Date.now();
    this.applyEvent(new AgentTerminatedEvent(this.id));
  }

  /**
   * Mark agent as idle
   */
  setIdle(): void {
    if (this._status.isActive() || this._status.isBusy()) {
      this._status = AgentStatus.idle();
      this.lastActive = Date.now();
      this.applyEvent(new AgentIdledEvent(this.id));
    }
  }

  /**
   * Activate the agent
   */
  activate(): void {
    if (!this._status.isTerminated()) {
      this._status = AgentStatus.active();
      this.lastActive = Date.now();
      this.applyEvent(new AgentActivatedEvent(this.id));
    }
  }

  /**
   * Convert to plain object for serialization
   */
  toJSON(): IAgent {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
      capabilities: this.capabilities,
      role: this.role,
      parent: this.parent,
      metadata: this.metadata,
      createdAt: this.createdAt,
      lastActive: this.lastActive
    };
  }

  /**
   * Create agent from config
   */
  static fromConfig(config: AgentConfig): Agent {
    return new Agent(config);
  }
}

export { Agent as default };
