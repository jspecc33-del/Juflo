/**
 * WorkflowEngine
 *
 * Thin application-layer facade over two domain services:
 * - WorkflowExecutor  — core execution loop + rollback
 * - WorkflowObserver  — metrics, debug info, event log
 *
 * Per DDD decomposition (ADR-DDD-001).
 */

import { EventEmitter } from 'events';
import { WorkflowExecutor, type TaskExecutionPort } from '../domain/WorkflowExecutor';
import { WorkflowObserver } from '../domain/WorkflowObserver';
import type { SwarmCoordinator } from '../../coordination/application/SwarmCoordinator';
import type {
  MemoryBackend,
  PluginManagerInterface,
  Task as ITask,
  TaskResult,
  WorkflowDefinition,
  WorkflowDebugInfo,
  WorkflowMetrics,
  WorkflowResult,
  WorkflowState,
} from '../../shared/types';

export interface WorkflowEngineOptions {
  coordinator: SwarmCoordinator;
  memoryBackend?: MemoryBackend;
  eventBus?: EventEmitter;
  pluginManager?: PluginManagerInterface;
}

interface WorkflowExecution {
  id: string;
  state: WorkflowState;
  observer: WorkflowObserver;
  promise?: Promise<WorkflowResult>;
}

export class WorkflowEngine {
  private executor: WorkflowExecutor;
  private coordinator: SwarmCoordinator;
  private memoryBackend?: MemoryBackend;
  private eventBus: EventEmitter;
  private pluginManager?: PluginManagerInterface;
  private workflows: Map<string, WorkflowExecution> = new Map();
  private initialized: boolean = false;

  constructor(options: WorkflowEngineOptions) {
    this.coordinator = options.coordinator;
    this.memoryBackend = options.memoryBackend;
    this.eventBus = options.eventBus ?? new EventEmitter();
    this.pluginManager = options.pluginManager;

    const port: TaskExecutionPort = {
      executeTask: (task, agentId) => this.executeTask(task, agentId),
      getAvailableAgentFor: async (taskType) => {
        const agents = await this.coordinator.listAgents();
        return agents.find(a => a.canExecute(taskType))?.id;
      },
      listAgents: () => this.coordinator.listAgents(),
    };
    this.executor = new WorkflowExecutor(port);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const exec of this.workflows.values()) {
      if (exec.state.status === 'in-progress') exec.state.status = 'cancelled';
    }
    this.workflows.clear();
    this.initialized = false;
  }

  async executeTask(task: ITask, agentId: string): Promise<TaskResult> {
    if (this.memoryBackend) {
      await this.memoryBackend.store({
        id: `task-start-${task.id}`,
        agentId,
        content: `Task ${task.id} started`,
        type: 'task-start',
        timestamp: Date.now(),
        metadata: { taskId: task.id, agentId },
      });
    }

    const result = await this.coordinator.executeTask(agentId, task);

    if (this.memoryBackend) {
      await this.memoryBackend.store({
        id: `task-complete-${task.id}`,
        agentId,
        content: `Task ${task.id} ${result.status}`,
        type: 'task-complete',
        timestamp: Date.now(),
        metadata: { taskId: task.id, agentId, status: result.status, duration: result.duration },
      });
    }

    return result;
  }

  async executeWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const exec = this.createExecution(workflow);
    this.workflows.set(workflow.id, exec);

    if (this.pluginManager) {
      await this.pluginManager.invokeExtensionPoint('workflow.beforeExecute', workflow);
    }

    this.eventBus.emit('workflow:started', { workflowId: workflow.id, taskCount: workflow.tasks.length });
    exec.observer.logEvent('workflow:started', { workflowId: workflow.id });

    try {
      const result = await this.executor.run(exec.state, workflow, exec.observer);

      if (workflow.rollbackOnFailure && result.status === 'failed') {
        await this.executor.rollback(exec.state.completedTasks, workflow, exec.observer);
      }

      if (this.pluginManager) {
        await this.pluginManager.invokeExtensionPoint('workflow.afterExecute', result);
      }

      this.eventBus.emit(
        result.status === 'completed' ? 'workflow:completed' : 'workflow:failed',
        { workflowId: workflow.id, result }
      );

      return result;
    } catch (error) {
      if (workflow.rollbackOnFailure) {
        await this.executor.rollback(exec.state.completedTasks, workflow, exec.observer);
      }
      this.eventBus.emit('workflow:failed', { workflowId: workflow.id, error });

      return {
        id: workflow.id,
        status: 'failed',
        tasksCompleted: exec.state.completedTasks.length,
        errors: [error instanceof Error ? error : new Error(String(error))],
        executionOrder: exec.observer.getSnapshot().executionOrder,
      };
    }
  }

  startWorkflow(workflow: WorkflowDefinition): Promise<WorkflowResult> {
    const promise = this.executeWorkflow(workflow);
    const exec = this.workflows.get(workflow.id);
    if (exec) exec.promise = promise;
    return promise;
  }

  async pauseWorkflow(workflowId: string): Promise<void> {
    const exec = this.workflows.get(workflowId);
    if (exec?.state.status === 'in-progress') {
      exec.state.status = 'paused';
      exec.observer.logEvent('workflow:paused', { workflowId });
    }
  }

  async resumeWorkflow(workflowId: string): Promise<void> {
    const exec = this.workflows.get(workflowId);
    if (exec?.state.status === 'paused') {
      exec.state.status = 'in-progress';
      exec.observer.logEvent('workflow:resumed', { workflowId });
    }
  }

  async getWorkflowState(workflowId: string): Promise<WorkflowState> {
    const exec = this.getExecution(workflowId);
    return exec.state;
  }

  async executeParallel(tasks: ITask[]): Promise<TaskResult[]> {
    return this.coordinator.executeTasksConcurrently(tasks);
  }

  async executeDistributedWorkflow(
    workflow: WorkflowDefinition,
    coordinators: SwarmCoordinator[]
  ): Promise<WorkflowResult> {
    const chunkSize = Math.ceil(workflow.tasks.length / coordinators.length);
    const chunks: ITask[][] = [];
    for (let i = 0; i < workflow.tasks.length; i += chunkSize) {
      chunks.push(workflow.tasks.slice(i, i + chunkSize));
    }

    const results: TaskResult[] = [];
    const errors: Error[] = [];

    await Promise.all(
      chunks.map(async (chunk, idx) => {
        const coord = coordinators[idx % coordinators.length];
        const agents = await coord.listAgents();
        if (!agents.length) return;
        for (const task of chunk) {
          const result = await coord.executeTask(agents[0].id, task);
          results.push(result);
          if (result.status === 'failed') errors.push(new Error(result.error ?? 'Task failed'));
        }
      })
    );

    return {
      id: workflow.id,
      status: errors.length === 0 ? 'completed' : 'failed',
      tasksCompleted: results.filter(r => r.status === 'completed').length,
      errors,
      executionOrder: workflow.tasks.map(t => t.id),
    };
  }

  async getWorkflowMetrics(workflowId: string): Promise<WorkflowMetrics> {
    const exec = this.getExecution(workflowId);
    return exec.observer.getMetrics(exec.state.tasks.length, exec.state.completedTasks.length);
  }

  async getWorkflowDebugInfo(workflowId: string): Promise<WorkflowDebugInfo> {
    return this.getExecution(workflowId).observer.getDebugInfo();
  }

  async restoreWorkflow(workflowId: string): Promise<WorkflowState> {
    if (!this.memoryBackend) throw new Error('Memory backend not available');
    const mem = await this.memoryBackend.retrieve(`workflow-state-${workflowId}`)
      ?? await this.memoryBackend.retrieve('workflow-state');
    if (!mem) throw new Error(`Workflow state not found for ${workflowId}`);
    return JSON.parse(mem.content);
  }

  private createExecution(workflow: WorkflowDefinition): WorkflowExecution {
    return {
      id: workflow.id,
      observer: new WorkflowObserver(),
      state: {
        id: workflow.id,
        name: workflow.name,
        tasks: workflow.tasks,
        status: 'in-progress',
        completedTasks: [],
        startedAt: Date.now(),
      },
    };
  }

  private getExecution(workflowId: string): WorkflowExecution {
    const exec = this.workflows.get(workflowId);
    if (!exec) throw new Error(`Workflow ${workflowId} not found`);
    return exec;
  }
}

export { WorkflowEngine as default };
