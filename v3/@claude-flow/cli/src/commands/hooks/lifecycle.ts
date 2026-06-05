/**
 * Lifecycle hook commands: pre-task, post-task, session-end, session-restore,
 * session-start (alias), notify, teammate-idle, task-completed
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';
import { callMCPTool, MCPClientError } from '../../mcp-client.js';

// Pre-task subcommand
export const preTaskCommand: Command = {
  name: 'pre-task',
  description: 'Record task start and get agent suggestions',
  options: [
    { name: 'task-id', short: 'i', description: 'Unique task identifier (auto-generated if omitted)', type: 'string' },
    { name: 'description', short: 'd', description: 'Task description', type: 'string', required: true },
    { name: 'auto-spawn', short: 'a', description: 'Auto-spawn suggested agents', type: 'boolean', default: false }
  ],
  examples: [
    { command: 'claude-flow hooks pre-task -i task-123 -d "Fix auth bug"', description: 'Record task start' },
    { command: 'claude-flow hooks pre-task -i task-456 -d "Implement feature" --auto-spawn', description: 'With auto-spawn' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = (ctx.flags.taskId as string) || `task-${Date.now().toString(36)}`;
    const description = ctx.args[0] || ctx.flags.description as string;
    if (!description) {
      output.printError('Description is required: --description "your task"');
      return { success: false, exitCode: 1 };
    }
    output.printInfo(`Starting task: ${output.highlight(taskId)}`);
    try {
      const result = await callMCPTool<{
        taskId: string; description: string;
        suggestedAgents: Array<{ type: string; confidence: number; reason: string }>;
        complexity: 'low' | 'medium' | 'high'; estimatedDuration: string;
        risks: string[]; recommendations: string[];
      }>('hooks_pre-task', { taskId, description, autoSpawn: ctx.flags.autoSpawn || false, timestamp: Date.now() });

      if (ctx.flags.format === 'json') { output.printJson(result); return { success: true, data: result }; }

      output.writeln();
      output.printBox([
        `Task ID: ${result.taskId}`, `Description: ${result.description}`,
        `Complexity: ${result.complexity.toUpperCase()}`, `Est. Duration: ${result.estimatedDuration}`
      ].join('\n'), 'Task Registered');

      if (result.suggestedAgents.length > 0) {
        output.writeln(); output.writeln(output.bold('Suggested Agents'));
        output.printTable({
          columns: [
            { key: 'type', header: 'Agent Type', width: 20 },
            { key: 'confidence', header: 'Confidence', width: 12, align: 'right', format: (v) => `${(Number(v) * 100).toFixed(1)}%` },
            { key: 'reason', header: 'Reason', width: 35 }
          ],
          data: result.suggestedAgents
        });
      }
      if (result.risks.length > 0) {
        output.writeln(); output.writeln(output.bold(output.error('Potential Risks')));
        output.printList(result.risks.map(r => output.warning(r)));
      }
      if (result.recommendations.length > 0) {
        output.writeln(); output.writeln(output.bold('Recommendations'));
        output.printList(result.recommendations);
      }

      // Enhanced model routing with Agent Booster AST (ADR-026)
      try {
        const { getEnhancedModelRouter } = await import('../../ruvector/enhanced-model-router.js');
        const router = getEnhancedModelRouter();
        const routeResult = await router.route(description, { filePath: ctx.flags.file as string });
        output.writeln(); output.writeln(output.bold('Intelligent Model Routing'));
        if (routeResult.tier === 1) {
          output.writeln(output.success(`  Tier 1: Agent Booster (WASM)`));
          output.writeln(output.dim(`  Intent: ${routeResult.agentBoosterIntent?.type}`));
          output.writeln(output.dim(`  Latency: <1ms | Cost: $0`));
          output.writeln(); output.writeln(output.dim('─'.repeat(60)));
          output.writeln(output.bold(output.success(`[AGENT_BOOSTER_AVAILABLE] Skip LLM - use Agent Booster for "${routeResult.agentBoosterIntent?.type}"`)));
          output.writeln(output.dim(`Confidence: ${(routeResult.confidence * 100).toFixed(0)}% | Intent: ${routeResult.agentBoosterIntent?.description}`));
          output.writeln(output.dim('─'.repeat(60)));
        } else {
          output.writeln(`  Tier ${routeResult.tier}: ${routeResult.handler.toUpperCase()}`);
          output.writeln(output.dim(`  Complexity: ${((routeResult.complexity || 0) * 100).toFixed(0)}%`));
          output.writeln(output.dim(`  Est. Latency: ${routeResult.estimatedLatencyMs}ms | Cost: $${routeResult.estimatedCost.toFixed(4)}`));
          output.writeln(); output.writeln(output.dim('─'.repeat(60)));
          output.writeln(output.bold(output.success(`[TASK_MODEL_RECOMMENDATION] Use model="${routeResult.model}" for this task`)));
          output.writeln(output.dim(`Complexity: ${((routeResult.complexity || 0) * 100).toFixed(0)}% | Confidence: ${(routeResult.confidence * 100).toFixed(0)}%`));
          output.writeln(output.dim('─'.repeat(60)));
        }
        (result as Record<string, unknown>).routeResult = routeResult;
        (result as Record<string, unknown>).recommendedModel = routeResult.model;
        (result as Record<string, unknown>).modelRouting = {
          tier: routeResult.tier, handler: routeResult.handler, model: routeResult.model,
          confidence: routeResult.confidence, complexity: routeResult.complexity,
          reasoning: routeResult.reasoning, canSkipLLM: routeResult.canSkipLLM,
          agentBoosterIntent: routeResult.agentBoosterIntent
        };
      } catch { /* Enhanced router not available, skip recommendation */ }

      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) { output.printError(`Pre-task hook failed: ${error.message}`); }
      else { output.printError(`Unexpected error: ${String(error)}`); }
      return { success: false, exitCode: 1 };
    }
  }
};

// Post-task subcommand
export const postTaskCommand: Command = {
  name: 'post-task',
  description: 'Record task completion for learning',
  options: [
    { name: 'task-id', short: 'i', description: 'Unique task identifier (auto-generated if not provided)', type: 'string', required: false },
    { name: 'success', short: 's', description: 'Whether the task succeeded', type: 'boolean', required: false },
    { name: 'quality', short: 'q', description: 'Quality score (0-1)', type: 'number' },
    { name: 'agent', short: 'a', description: 'Agent that executed the task', type: 'string' }
  ],
  examples: [
    { command: 'claude-flow hooks post-task -i task-123 --success true', description: 'Record successful completion' },
    { command: 'claude-flow hooks post-task -i task-456 --success false -q 0.3', description: 'Record failed task' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = (ctx.flags.taskId as string) || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const success = ctx.flags.success !== undefined ? (ctx.flags.success as boolean) : true;
    output.printInfo(`Recording outcome for task: ${output.highlight(taskId)}`);
    try {
      const result = await callMCPTool<{
        taskId: string; success: boolean; duration: number;
        learningUpdates: { patternsUpdated: number; newPatterns: number; trajectoryId: string };
      }>('hooks_post-task', { taskId, success, quality: ctx.flags.quality, agent: ctx.flags.agent, timestamp: Date.now() });
      if (ctx.flags.format === 'json') { output.printJson(result); return { success: true, data: result }; }
      output.writeln(); output.printSuccess(`Task outcome recorded: ${success ? 'SUCCESS' : 'FAILED'}`);
      output.writeln(); output.writeln(output.bold('Learning Updates'));
      output.printTable({
        columns: [{ key: 'metric', header: 'Metric', width: 25 }, { key: 'value', header: 'Value', width: 20, align: 'right' }],
        data: [
          { metric: 'Patterns Updated', value: result.learningUpdates.patternsUpdated },
          { metric: 'New Patterns', value: result.learningUpdates.newPatterns },
          { metric: 'Duration', value: `${(result.duration / 1000).toFixed(1)}s` },
          { metric: 'Trajectory ID', value: result.learningUpdates.trajectoryId }
        ]
      });
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) { output.printError(`Post-task hook failed: ${error.message}`); }
      else { output.printError(`Unexpected error: ${String(error)}`); }
      return { success: false, exitCode: 1 };
    }
  }
};

// Session-end subcommand
export const sessionEndCommand: Command = {
  name: 'session-end',
  description: 'End current session and persist state',
  options: [
    { name: 'save-state', short: 's', description: 'Save session state for later restoration', type: 'boolean', default: true }
  ],
  examples: [
    { command: 'claude-flow hooks session-end', description: 'End and save session' },
    { command: 'claude-flow hooks session-end --save-state false', description: 'End without saving' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    output.printInfo('Ending session...');
    try {
      const result = await callMCPTool<{
        sessionId: string; duration: number; statePath?: string;
        summary: { tasksExecuted: number; tasksSucceeded: number; tasksFailed: number; commandsExecuted: number; filesModified: number; agentsSpawned: number };
      }>('hooks_session-end', { saveState: ctx.flags.saveState ?? true, timestamp: Date.now() });
      if (ctx.flags.format === 'json') { output.printJson(result); return { success: true, data: result }; }
      output.writeln(); output.printSuccess(`Session ${result.sessionId} ended`);
      output.writeln(); output.writeln(output.bold('Session Summary'));
      output.printTable({
        columns: [{ key: 'metric', header: 'Metric', width: 25 }, { key: 'value', header: 'Value', width: 15, align: 'right' }],
        data: [
          { metric: 'Duration', value: `${(result.duration / 1000 / 60).toFixed(1)} min` },
          { metric: 'Tasks Executed', value: result.summary.tasksExecuted },
          { metric: 'Tasks Succeeded', value: output.success(String(result.summary.tasksSucceeded)) },
          { metric: 'Tasks Failed', value: output.error(String(result.summary.tasksFailed)) },
          { metric: 'Commands Executed', value: result.summary.commandsExecuted },
          { metric: 'Files Modified', value: result.summary.filesModified },
          { metric: 'Agents Spawned', value: result.summary.agentsSpawned }
        ]
      });
      if (result.statePath) { output.writeln(); output.writeln(output.dim(`State saved to: ${result.statePath}`)); }
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) { output.printError(`Session-end hook failed: ${error.message}`); }
      else { output.printError(`Unexpected error: ${String(error)}`); }
      return { success: false, exitCode: 1 };
    }
  }
};

// Session-restore subcommand
export const sessionRestoreCommand: Command = {
  name: 'session-restore',
  description: 'Restore a previous session',
  options: [
    { name: 'session-id', short: 'i', description: 'Session ID to restore (use "latest" for most recent)', type: 'string', default: 'latest' },
    { name: 'restore-agents', short: 'a', description: 'Restore spawned agents', type: 'boolean', default: true },
    { name: 'restore-tasks', short: 't', description: 'Restore active tasks', type: 'boolean', default: true }
  ],
  examples: [
    { command: 'claude-flow hooks session-restore', description: 'Restore latest session' },
    { command: 'claude-flow hooks session-restore -i session-12345', description: 'Restore specific session' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const sessionId = ctx.args[0] || ctx.flags.sessionId as string || 'latest';
    output.printInfo(`Restoring session: ${output.highlight(sessionId)}`);
    try {
      const result = await callMCPTool<{
        sessionId: string; originalSessionId: string;
        restoredState: { tasksRestored: number; agentsRestored: number; memoryRestored: number };
        warnings?: string[];
      }>('hooks_session-restore', { sessionId, restoreAgents: ctx.flags.restoreAgents ?? true, restoreTasks: ctx.flags.restoreTasks ?? true, timestamp: Date.now() });
      if (ctx.flags.format === 'json') { output.printJson(result); return { success: true, data: result }; }
      output.writeln(); output.printSuccess(`Session restored from ${result.originalSessionId}`);
      output.writeln(output.dim(`New session ID: ${result.sessionId}`));
      output.writeln(); output.writeln(output.bold('Restored State'));
      output.printTable({
        columns: [{ key: 'item', header: 'Item', width: 25 }, { key: 'count', header: 'Count', width: 15, align: 'right' }],
        data: [
          { item: 'Tasks', count: result.restoredState.tasksRestored },
          { item: 'Agents', count: result.restoredState.agentsRestored },
          { item: 'Memory Entries', count: result.restoredState.memoryRestored }
        ]
      });
      if (result.warnings && result.warnings.length > 0) {
        output.writeln(); output.writeln(output.bold(output.warning('Warnings')));
        output.printList(result.warnings.map(w => output.warning(w)));
      }
      return { success: true, data: result };
    } catch (error) {
      if (error instanceof MCPClientError) { output.printError(`Session-restore hook failed: ${error.message}`); }
      else { output.printError(`Unexpected error: ${String(error)}`); }
      return { success: false, exitCode: 1 };
    }
  }
};

// Notify subcommand
export const notifyCommand: Command = {
  name: 'notify',
  description: 'Send a notification message (logged to session)',
  options: [
    { name: 'message', short: 'm', type: 'string', description: 'Notification message', required: true },
    { name: 'level', short: 'l', type: 'string', description: 'Level: info, warn, error', default: 'info' },
    { name: 'channel', short: 'c', type: 'string', description: 'Notification channel', default: 'console' },
  ],
  examples: [
    { command: 'claude-flow hooks notify -m "Build complete"', description: 'Send info notification' },
    { command: 'claude-flow hooks notify -m "Test failed" -l error', description: 'Send error notification' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const message = ctx.args[0] || ctx.flags.message as string;
    const level = (ctx.flags.level as string) || 'info';
    if (!message) {
      output.printError('Message is required: --message "your message"');
      return { success: false, exitCode: 1 };
    }
    const timestamp = new Date().toISOString();
    if (level === 'error') { output.printError(`[${timestamp}] ${message}`); }
    else if (level === 'warn') { output.writeln(output.warning(`[${timestamp}] ${message}`)); }
    else { output.printInfo(`[${timestamp}] ${message}`); }
    try {
      const { storeEntry } = await import('../../memory/memory-initializer.js');
      await storeEntry({ key: `notify-${Date.now()}`, value: `[${level}] ${message}`, namespace: 'notifications' });
    } catch { /* memory not available */ }
    return { success: true, data: { timestamp, level, message } };
  }
};

// Teammate Idle command - Agent Teams integration
export const teammateIdleCommand: Command = {
  name: 'teammate-idle',
  description: 'Handle idle teammate in Agent Teams - auto-assign tasks or notify lead',
  options: [
    { name: 'auto-assign', short: 'a', description: 'Automatically assign pending tasks to idle teammate', type: 'boolean', default: true },
    { name: 'check-task-list', short: 'c', description: 'Check shared task list for available work', type: 'boolean', default: true },
    { name: 'teammate-id', short: 't', description: 'ID of the idle teammate', type: 'string' },
    { name: 'team-name', description: 'Team name for context', type: 'string' }
  ],
  examples: [
    { command: 'claude-flow hooks teammate-idle --auto-assign true', description: 'Auto-assign tasks to idle teammate' },
    { command: 'claude-flow hooks teammate-idle -t worker-1 --check-task-list', description: 'Check tasks for specific teammate' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const autoAssign = ctx.flags.autoAssign !== false;
    const checkTaskList = ctx.flags.checkTaskList !== false;
    const teammateId = ctx.flags.teammateId as string;
    const teamName = ctx.flags.teamName as string;
    if (ctx.flags.format !== 'json') {
      output.printInfo(`Teammate idle hook triggered${teammateId ? ` for: ${output.highlight(teammateId)}` : ''}`);
    }
    try {
      const result = await callMCPTool<{
        success: boolean; teammateId: string;
        action: 'assigned' | 'waiting' | 'notified';
        taskAssigned?: { taskId: string; subject: string; priority: string };
        pendingTasks: number; message: string;
      }>('hooks_teammate-idle', { autoAssign, checkTaskList, teammateId, teamName, timestamp: Date.now() });
      if (ctx.flags.format === 'json') { output.printJson(result); return { success: true, data: result }; }
      output.writeln();
      if (result.action === 'assigned' && result.taskAssigned) {
        output.printSuccess(`Task assigned: ${result.taskAssigned.subject}`);
        output.printList([`Task ID: ${result.taskAssigned.taskId}`, `Priority: ${result.taskAssigned.priority}`, `Pending tasks remaining: ${result.pendingTasks}`]);
      } else if (result.action === 'waiting') {
        output.printInfo('No pending tasks available - teammate waiting for work');
      } else {
        output.printInfo(`Team lead notified: ${result.message}`);
      }
      return { success: true, data: result };
    } catch {
      if (ctx.flags.format === 'json') {
        output.printJson({ success: true, action: 'waiting', message: 'Teammate idle - no MCP server' });
      } else {
        output.printInfo('Teammate idle - awaiting task assignment');
      }
      return { success: true };
    }
  }
};

// Task Completed command - Agent Teams integration
export const taskCompletedCommand: Command = {
  name: 'task-completed',
  description: 'Handle task completion in Agent Teams - train patterns and notify lead',
  options: [
    { name: 'task-id', short: 'i', description: 'ID of the completed task', type: 'string', required: true },
    { name: 'train-patterns', short: 'p', description: 'Train neural patterns from successful task', type: 'boolean', default: true },
    { name: 'notify-lead', short: 'n', description: 'Notify team lead of task completion', type: 'boolean', default: true },
    { name: 'success', short: 's', description: 'Whether the task succeeded', type: 'boolean', default: true },
    { name: 'quality', short: 'q', description: 'Quality score (0-1)', type: 'number' },
    { name: 'teammate-id', short: 't', description: 'ID of the teammate that completed the task', type: 'string' }
  ],
  examples: [
    { command: 'claude-flow hooks task-completed -i task-123 --train-patterns', description: 'Complete task and train patterns' },
    { command: 'claude-flow hooks task-completed -i task-456 --notify-lead --quality 0.95', description: 'Complete with quality score' }
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    const taskId = ctx.args[0] || ctx.flags.taskId as string;
    const trainPatterns = ctx.flags.trainPatterns !== false;
    const notifyLead = ctx.flags.notifyLead !== false;
    const success = ctx.flags.success !== false;
    const quality = ctx.flags.quality as number;
    const teammateId = ctx.flags.teammateId as string;
    if (!taskId) {
      output.printError('Task ID is required. Use --task-id or -i flag.');
      return { success: false, exitCode: 1 };
    }
    if (ctx.flags.format !== 'json') { output.printInfo(`Task completed: ${output.highlight(taskId)}`); }
    try {
      const result = await callMCPTool<{
        success: boolean; taskId: string; patternsLearned: number; leadNotified: boolean;
        metrics: { duration: number; quality: number; learningUpdates: number };
        nextTask?: { taskId: string; subject: string };
      }>('hooks_task-completed', { taskId, trainPatterns, notifyLead, success, quality, teammateId, timestamp: Date.now() });
      if (ctx.flags.format === 'json') { output.printJson(result); return { success: true, data: result }; }
      output.writeln(); output.printSuccess(`Task ${taskId} marked complete`);
      output.writeln(); output.writeln(output.bold('Completion Metrics'));
      output.printTable({
        columns: [{ key: 'metric', header: 'Metric', width: 25 }, { key: 'value', header: 'Value', width: 20, align: 'right' }],
        data: [
          { metric: 'Patterns Learned', value: result.patternsLearned },
          { metric: 'Quality Score', value: quality ? `${(quality * 100).toFixed(0)}%` : 'N/A' },
          { metric: 'Lead Notified', value: result.leadNotified ? 'Yes' : 'No' },
          { metric: 'Learning Updates', value: result.metrics?.learningUpdates || 0 }
        ]
      });
      if (result.nextTask) { output.writeln(); output.printInfo(`Next available task: ${result.nextTask.subject}`); }
      return { success: true, data: result };
    } catch {
      if (ctx.flags.format === 'json') {
        output.printJson({ success: true, taskId, message: 'Task completed - patterns pending' });
      } else {
        output.printSuccess(`Task ${taskId} completed`);
        if (trainPatterns) { output.printInfo('Pattern training queued for next sync'); }
      }
      return { success: true };
    }
  }
};
