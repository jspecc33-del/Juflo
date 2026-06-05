/**
 * Shared types for hooks submodules
 */

export interface CoverageFileEntry {
  filePath: string;
  lines: number;
  branches: number;
  functions: number;
  statements: number;
}

export interface CoverageData {
  found: boolean;
  source: string;
  entries: CoverageFileEntry[];
  summary: {
    totalFiles: number;
    overallLineCoverage: number;
    overallBranchCoverage: number;
    overallFunctionCoverage: number;
    overallStatementCoverage: number;
  };
}

// Hook types list
export const HOOK_TYPES = [
  { value: 'pre-edit', label: 'Pre-Edit', hint: 'Get context before editing files' },
  { value: 'post-edit', label: 'Post-Edit', hint: 'Record editing outcomes' },
  { value: 'pre-command', label: 'Pre-Command', hint: 'Assess risk before commands' },
  { value: 'post-command', label: 'Post-Command', hint: 'Record command outcomes' },
  { value: 'route', label: 'Route', hint: 'Route tasks to optimal agents' },
  { value: 'explain', label: 'Explain', hint: 'Explain routing decisions' }
];

// Agent routing options
export const AGENT_TYPES = [
  'coder', 'researcher', 'tester', 'reviewer', 'architect',
  'security-architect', 'security-auditor', 'memory-specialist',
  'swarm-specialist', 'performance-engineer', 'core-architect',
  'test-architect', 'coordinator', 'analyst', 'optimizer'
];
