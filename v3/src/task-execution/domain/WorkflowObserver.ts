/**
 * WorkflowObserver — Domain Service
 *
 * Collects timing, event logs, and memory snapshots for a workflow execution.
 * Generates metrics and debug info. Extracted from WorkflowEngine per DDD decomposition.
 */

import type { WorkflowDebugInfo, WorkflowMetrics } from '../../shared/types';

export interface ObservedExecution {
  taskCount: number;
  completedTaskIds: string[];
  taskTimings: Record<string, { start: number; end: number; duration: number }>;
  eventLog: Array<{ timestamp: number; event: string; data: unknown }>;
  memorySnapshots: Array<{ timestamp: number; snapshot: Record<string, unknown> }>;
  executionOrder: string[];
}

export class WorkflowObserver {
  private timings: Record<string, { start: number; end: number; duration: number }> = {};
  private eventLog: Array<{ timestamp: number; event: string; data: unknown }> = [];
  private memorySnapshots: Array<{ timestamp: number; snapshot: Record<string, unknown> }> = [];
  private executionOrder: string[] = [];

  recordTaskStart(taskId: string): number {
    const start = Date.now();
    this.timings[taskId] = { start, end: 0, duration: 0 };
    return start;
  }

  recordTaskEnd(taskId: string, start: number): void {
    const end = Date.now();
    this.timings[taskId] = { start, end, duration: end - start };
    this.executionOrder.push(taskId);
  }

  logEvent(event: string, data: unknown): void {
    this.eventLog.push({ timestamp: Date.now(), event, data });
  }

  snapshotMemory(snapshot: Record<string, unknown>): void {
    this.memorySnapshots.push({ timestamp: Date.now(), snapshot });
  }

  getMetrics(totalTasks: number, completedCount: number): WorkflowMetrics {
    const durations = Object.values(this.timings).map(t => t.duration);
    const totalDuration = durations.reduce((a, b) => a + b, 0);
    return {
      tasksTotal: totalTasks,
      tasksCompleted: completedCount,
      totalDuration,
      averageTaskDuration: durations.length > 0 ? totalDuration / durations.length : 0,
      successRate: totalTasks > 0 ? completedCount / totalTasks : 0,
    };
  }

  getDebugInfo(): WorkflowDebugInfo {
    return {
      executionTrace: this.executionOrder.map(taskId => ({
        taskId,
        timestamp: this.timings[taskId]?.start ?? Date.now(),
        action: 'execute',
      })),
      taskTimings: this.timings,
      memorySnapshots: this.memorySnapshots,
      eventLog: this.eventLog,
    };
  }

  getSnapshot(): ObservedExecution {
    return {
      taskCount: Object.keys(this.timings).length,
      completedTaskIds: this.executionOrder.slice(),
      taskTimings: { ...this.timings },
      eventLog: this.eventLog.slice(),
      memorySnapshots: this.memorySnapshots.slice(),
      executionOrder: this.executionOrder.slice(),
    };
  }
}
