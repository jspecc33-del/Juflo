export type ToolId = 'ghidra' | 'ida' | 'dnspy' | 'x64dbg' | 'ws' | 'can' | 'spm';
export type Domain = 'malware' | 'automotive' | 'iot' | 'network';
export type TabId = 'cfg' | 'hk' | 'ho' | 'pr';

export interface ConfigEntry {
  key: string;
  value: string;
  note: string;
}

export interface HotkeyEntry {
  keys: string[];
  action: string;
  context: string;
}

export interface HandoffEntry {
  direction: 'to' | 'from';
  tool: string;
  procedure: string;
  artifact: string;
}

export interface ProtocolEntry {
  format: string;
  name: string;
  notes: string;
}

export interface RETool {
  id: ToolId;
  name: string;
  sub: string;
  color: string;
  domains: Domain[];
  cfg: ConfigEntry[];
  hk: HotkeyEntry[];
  ho: HandoffEntry[];
  pr: ProtocolEntry[];
}

export interface SearchResult {
  toolId: ToolId;
  toolName: string;
  tab: TabId;
  field: string;
  snippet: string;
  score: number;
}

export interface SwarmAnalysisRequest {
  task: string;
  domain?: Domain;
  tools?: ToolId[];
  context?: string;
}

export interface SwarmAnalysisResult {
  swarmId: string;
  task: string;
  recommendedTools: ToolId[];
  workflowSteps: string[];
  agentNotes: string;
  memoryKey: string;
}

export interface MemoryEntry {
  key: string;
  namespace: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface MCPToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}
