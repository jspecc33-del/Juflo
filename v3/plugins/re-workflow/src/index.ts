export { RE_TOOLS, RE_TOOLS_MAP } from './data.js';
export * from './types.js';
export {
  listTools,
  getTool,
  search,
  swarmAnalyze,
  memoryStore,
  memoryRetrieve,
} from './mcp-tools.js';

export const ReWorkflowPlugin = {
  name: '@claude-flow/plugin-re-workflow',
  version: '0.1.0',
  tools: [
    're_workflow/list_tools',
    're_workflow/get_tool',
    're_workflow/search',
    're_workflow/swarm_analyze',
    're_workflow/memory_store',
    're_workflow/memory_retrieve',
  ],
} as const;
