/**
 * Hooks command index: assembles all hook subcommands into the main hooksCommand.
 * Re-exports hooksCommand for backward compatibility with commands/hooks.ts.
 */

import type { Command, CommandContext, CommandResult } from '../../types.js';
import { output } from '../../output.js';

// Edit hooks
import { preEditCommand, postEditCommand, preCommandCommand, postCommandCommand } from './edit.js';

// Lifecycle hooks
import {
  preTaskCommand,
  postTaskCommand,
  sessionEndCommand,
  sessionRestoreCommand,
  notifyCommand,
  teammateIdleCommand,
  taskCompletedCommand,
} from './lifecycle.js';

// Routing hooks
import {
  routeCommand,
  explainCommand,
  pretrainCommand,
  buildAgentsCommand,
  metricsCommand,
  transferCommand,
  listCommand,
} from './routing.js';

// Intelligence hook
import { intelligenceCommand } from './intelligence.js';

// Worker hook
import { workerCommand } from './worker.js';

// Coverage hooks
import { coverageRouteCommand, coverageSuggestCommand, coverageGapsCommand } from './coverage.js';

// Statusline + model routing hooks
import {
  progressHookCommand,
  statuslineCommand,
  tokenOptimizeCommand,
  modelRouteCommand,
  modelOutcomeCommand,
  modelStatsCommand,
} from './statusline.js';

// Backward-compatible aliases for v2 hooks
// These ensure old settings.json files continue to work
const routeTaskCommand: Command = {
  name: 'route-task',
  description: '(DEPRECATED: Use "route" instead) Route task to optimal agent',
  options: routeCommand.options,
  examples: [
    { command: 'claude-flow hooks route-task --auto-swarm true', description: 'Route with auto-swarm (v2 compat)' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Silently handle v2-specific flags that don't exist in v3
    // --auto-swarm, --detect-complexity are ignored but don't fail
    if (routeCommand.action) {
      const result = await routeCommand.action(ctx);
      return result || { success: true };
    }
    return { success: true };
  }
};

const sessionStartCommand: Command = {
  name: 'session-start',
  description: '(DEPRECATED: Use "session-restore" instead) Start/restore session',
  options: [
    ...(sessionRestoreCommand.options || []),
    // V2-compatible options that are silently ignored
    {
      name: 'auto-configure',
      description: '(v2 compat) Auto-configure session',
      type: 'boolean',
      default: false
    },
    {
      name: 'restore-context',
      description: '(v2 compat) Restore context',
      type: 'boolean',
      default: false
    }
  ],
  examples: [
    { command: 'claude-flow hooks session-start --auto-configure true', description: 'Start session (v2 compat)' },
  ],
  action: async (ctx: CommandContext): Promise<CommandResult> => {
    // Map to session-restore for backward compatibility
    if (sessionRestoreCommand.action) {
      const result = await sessionRestoreCommand.action(ctx);
      return result || { success: true };
    }
    return { success: true };
  }
};

// Pre-bash alias for pre-command (v2 compat)
const preBashCommand: Command = {
  name: 'pre-bash',
  description: '(ALIAS) Same as pre-command',
  options: preCommandCommand.options,
  examples: preCommandCommand.examples,
  action: preCommandCommand.action
};

// Post-bash alias for post-command (v2 compat)
const postBashCommand: Command = {
  name: 'post-bash',
  description: '(ALIAS) Same as post-command',
  options: postCommandCommand.options,
  examples: postCommandCommand.examples,
  action: postCommandCommand.action
};

// Main hooks command
export const hooksCommand: Command = {
  name: 'hooks',
  description: 'Self-learning hooks system for intelligent workflow automation',
  subcommands: [
    preEditCommand,
    postEditCommand,
    preCommandCommand,
    postCommandCommand,
    preTaskCommand,
    postTaskCommand,
    sessionEndCommand,
    sessionRestoreCommand,
    routeCommand,
    explainCommand,
    pretrainCommand,
    buildAgentsCommand,
    metricsCommand,
    transferCommand,
    listCommand,
    intelligenceCommand,
    notifyCommand,
    workerCommand,
    progressHookCommand,
    statuslineCommand,
    // Coverage-aware routing commands
    coverageRouteCommand,
    coverageSuggestCommand,
    coverageGapsCommand,
    // Token optimization
    tokenOptimizeCommand,
    // Model routing (tiny-dancer integration)
    modelRouteCommand,
    modelOutcomeCommand,
    modelStatsCommand,
    // Backward-compatible aliases for v2
    routeTaskCommand,
    sessionStartCommand,
    preBashCommand,
    postBashCommand,
    // Agent Teams integration
    teammateIdleCommand,
    taskCompletedCommand,
  ],
  options: [],
  examples: [
    { command: 'claude-flow hooks pre-edit -f src/utils.ts', description: 'Get context before editing' },
    { command: 'claude-flow hooks route -t "Fix authentication bug"', description: 'Route task to optimal agent' },
    { command: 'claude-flow hooks pretrain', description: 'Bootstrap intelligence from repository' },
    { command: 'claude-flow hooks metrics --v3-dashboard', description: 'View V3 performance metrics' }
  ],
  action: async (_ctx: CommandContext): Promise<CommandResult> => {
    output.writeln();
    output.writeln(output.bold('Self-Learning Hooks System'));
    output.writeln();
    output.writeln('Intelligent workflow automation with pattern learning and adaptive routing');
    output.writeln();
    output.writeln('Usage: claude-flow hooks <subcommand> [options]');
    output.writeln();
    output.writeln('Subcommands:');
    output.printList([
      `${output.highlight('pre-edit')}        - Get context before editing files`,
      `${output.highlight('post-edit')}       - Record editing outcomes for learning`,
      `${output.highlight('pre-command')}     - Assess risk before executing commands`,
      `${output.highlight('post-command')}    - Record command execution outcomes`,
      `${output.highlight('pre-task')}        - Record task start and get agent suggestions`,
      `${output.highlight('post-task')}       - Record task completion for learning`,
      `${output.highlight('session-end')}     - End current session and persist state`,
      `${output.highlight('session-restore')} - Restore a previous session`,
      `${output.highlight('route')}           - Route tasks to optimal agents`,
      `${output.highlight('explain')}         - Explain routing decisions`,
      `${output.highlight('pretrain')}        - Bootstrap intelligence from repository`,
      `${output.highlight('build-agents')}    - Generate optimized agent configs`,
      `${output.highlight('metrics')}         - View learning metrics dashboard`,
      `${output.highlight('transfer')}        - Transfer patterns from another project`,
      `${output.highlight('list')}            - List all registered hooks`,
      `${output.highlight('worker')}          - Background worker management (12 workers)`,
      `${output.highlight('progress')}        - Check V3 implementation progress`,
      `${output.highlight('statusline')}      - Generate dynamic statusline display`,
      `${output.highlight('coverage-route')}  - Route tasks based on coverage gaps (ruvector)`,
      `${output.highlight('coverage-suggest')}- Suggest coverage improvements`,
      `${output.highlight('coverage-gaps')}   - List all coverage gaps with agents`,
      `${output.highlight('token-optimize')} - Token optimization (30-50% savings)`,
      `${output.highlight('model-route')}    - Route to optimal model (haiku/sonnet/opus)`,
      `${output.highlight('model-outcome')}  - Record model routing outcome`,
      `${output.highlight('model-stats')}    - View model routing statistics`,
      '',
      output.bold('Agent Teams:'),
      `${output.highlight('teammate-idle')}  - Handle idle teammate (auto-assign tasks)`,
      `${output.highlight('task-completed')} - Handle task completion (train patterns)`
    ]);
    output.writeln();
    output.writeln('Run "claude-flow hooks <subcommand> --help" for subcommand help');
    output.writeln();
    output.writeln(output.bold('V3 Features:'));
    output.printList([
      '🧠 ReasoningBank adaptive learning',
      '⚡ Flash Attention (2.49x-7.47x speedup)',
      '🔍 AgentDB integration (150x faster search)',
      '📊 84.8% SWE-Bench solve rate',
      '🎯 32.3% token reduction',
      '🚀 2.8-4.4x speed improvement',
      '👥 Agent Teams integration (auto task assignment)'
    ]);

    return { success: true };
  }
};

export default hooksCommand;
