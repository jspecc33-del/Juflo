import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { RE_TOOLS, RE_TOOLS_MAP } from './data.js';
import type {
  ToolId,
  Domain,
  TabId,
  RETool,
  SearchResult,
  SwarmAnalysisResult,
  MCPToolResult,
} from './types.js';

// ============================================================================
// Tool 1: re_workflow/list_tools
// ============================================================================

export function listTools(input: { domain?: Domain }): MCPToolResult {
  const tools = input.domain
    ? RE_TOOLS.filter(t => t.domains.includes(input.domain!))
    : RE_TOOLS;

  if (tools.length === 0) {
    return { content: [{ type: 'text', text: `No tools found for domain: ${input.domain}` }] };
  }

  const header = `RE Tools Reference${input.domain ? ` — domain: ${input.domain}` : ''}\n`;
  const divider = '─'.repeat(80) + '\n';
  const colHeader = padR('ID', 8) + padR('Name', 24) + padR('Subtitle', 30) + padR('Domains', 32) + padR('cfg', 5) + padR('hk', 5) + padR('ho', 5) + 'pr\n';

  const rows = tools.map(t =>
    padR(t.id, 8) +
    padR(t.name, 24) +
    padR(t.sub, 30) +
    padR(t.domains.join(', '), 32) +
    padR(String(t.cfg.length), 5) +
    padR(String(t.hk.length), 5) +
    padR(String(t.ho.length), 5) +
    String(t.pr.length)
  ).join('\n');

  const text = header + divider + colHeader + divider + rows + '\n' + divider +
    `Total: ${tools.length} tool(s)\n`;

  return { content: [{ type: 'text', text }] };
}

// ============================================================================
// Tool 2: re_workflow/get_tool
// ============================================================================

export function getTool(input: { toolId: ToolId; tab?: TabId }): MCPToolResult {
  const tool = RE_TOOLS_MAP[input.toolId];
  if (!tool) {
    return {
      content: [{ type: 'text', text: `Tool not found: ${input.toolId}` }],
      isError: true,
    };
  }

  const parts: string[] = [];
  const divider = '─'.repeat(80);

  parts.push(`${tool.name}  (${tool.sub})`);
  parts.push(`Domains: ${tool.domains.join(', ')}`);
  parts.push(divider);

  const renderTab = (tab: TabId) => {
    switch (tab) {
      case 'cfg': {
        parts.push('\nCONFIGURATION');
        parts.push(padR('Key', 28) + padR('Value', 36) + 'Note');
        parts.push('─'.repeat(100));
        for (const e of tool.cfg) {
          parts.push(padR(e.key, 28) + padR(e.value, 36) + e.note);
        }
        break;
      }
      case 'hk': {
        parts.push('\nHOTKEYS');
        parts.push(padR('Keys', 30) + padR('Action', 40) + 'Context');
        parts.push('─'.repeat(90));
        for (const e of tool.hk) {
          parts.push(padR(e.keys.join('+'), 30) + padR(e.action, 40) + e.context);
        }
        break;
      }
      case 'ho': {
        parts.push('\nHANDOFFS');
        parts.push(padR('Dir', 6) + padR('Tool', 24) + padR('Procedure', 50) + 'Artifact');
        parts.push('─'.repeat(110));
        for (const e of tool.ho) {
          const dir = e.direction === 'to' ? '→ TO' : '← FROM';
          parts.push(padR(dir, 6) + padR(e.tool, 24) + padR(e.procedure, 50) + e.artifact);
        }
        break;
      }
      case 'pr': {
        parts.push('\nPROTOCOLS / FILE FORMATS');
        parts.push(padR('Format', 20) + padR('Name', 30) + 'Notes');
        parts.push('─'.repeat(90));
        for (const e of tool.pr) {
          parts.push(padR(e.format, 20) + padR(e.name, 30) + e.notes);
        }
        break;
      }
    }
  };

  if (input.tab) {
    renderTab(input.tab);
  } else {
    for (const tab of ['cfg', 'hk', 'ho', 'pr'] as TabId[]) {
      renderTab(tab);
    }
  }

  return { content: [{ type: 'text', text: parts.join('\n') }] };
}

// ============================================================================
// Tool 3: re_workflow/search
// ============================================================================

export function search(input: {
  query: string;
  domain?: Domain;
  tab?: TabId;
  limit?: number;
}): MCPToolResult {
  const { query, domain, tab, limit = 10 } = input;
  const q = query.toLowerCase();
  const results: SearchResult[] = [];

  const tools = domain
    ? RE_TOOLS.filter(t => t.domains.includes(domain))
    : RE_TOOLS;

  const tryAdd = (
    tool: RETool,
    tabId: TabId,
    field: string,
    snippet: string,
    score: number
  ) => {
    if (snippet.toLowerCase().includes(q)) {
      results.push({ toolId: tool.id, toolName: tool.name, tab: tabId, field, snippet, score });
    }
  };

  for (const tool of tools) {
    if (!tab || tab === 'cfg') {
      for (const e of tool.cfg) {
        tryAdd(tool, 'cfg', 'key', e.key, 3);
        tryAdd(tool, 'cfg', 'value', e.value, 2);
        tryAdd(tool, 'cfg', 'note', e.note, 1);
      }
    }
    if (!tab || tab === 'hk') {
      for (const e of tool.hk) {
        tryAdd(tool, 'hk', 'action', e.action, 2);
        tryAdd(tool, 'hk', 'context', e.context, 1);
        tryAdd(tool, 'hk', 'keys', e.keys.join('+'), 3);
      }
    }
    if (!tab || tab === 'ho') {
      for (const e of tool.ho) {
        tryAdd(tool, 'ho', 'tool', e.tool, 3);
        tryAdd(tool, 'ho', 'procedure', e.procedure, 2);
        tryAdd(tool, 'ho', 'artifact', e.artifact, 1);
      }
    }
    if (!tab || tab === 'pr') {
      for (const e of tool.pr) {
        tryAdd(tool, 'pr', 'format', e.format, 3);
        tryAdd(tool, 'pr', 'name', e.name, 3);
        tryAdd(tool, 'pr', 'notes', e.notes, 1);
      }
    }
  }

  const deduped = deduplicateResults(results);
  deduped.sort((a, b) => b.score - a.score);
  const top = deduped.slice(0, limit);

  if (top.length === 0) {
    return { content: [{ type: 'text', text: `No results for query: "${query}"` }] };
  }

  const lines: string[] = [`Search: "${query}"${domain ? `  domain:${domain}` : ''}${tab ? `  tab:${tab}` : ''}  — ${top.length} result(s)\n`];
  lines.push(padR('#', 4) + padR('Tool', 14) + padR('Tab', 6) + padR('Field', 12) + padR('Score', 7) + 'Snippet');
  lines.push('─'.repeat(90));
  top.forEach((r, i) => {
    const snippet = r.snippet.length > 55 ? r.snippet.slice(0, 52) + '...' : r.snippet;
    lines.push(padR(String(i + 1), 4) + padR(r.toolName, 14) + padR(r.tab, 6) + padR(r.field, 12) + padR(String(r.score), 7) + snippet);
  });

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ============================================================================
// Tool 4: re_workflow/swarm_analyze
// ============================================================================

export function swarmAnalyze(input: {
  task: string;
  domain?: Domain;
  tools?: ToolId[];
  context?: string;
}): MCPToolResult {
  const { task, domain, tools: forcedTools, context } = input;
  const taskLower = task.toLowerCase();
  const contextLower = (context ?? '').toLowerCase();
  const combined = taskLower + ' ' + contextLower;

  const toolScores: Map<ToolId, number> = new Map();

  const scoreKeywords: Array<[string, ToolId, number]> = [
    ['decompil', 'ghidra', 3], ['static', 'ghidra', 2], ['ghidra', 'ghidra', 5],
    ['binary', 'ghidra', 2], ['firmware', 'ghidra', 3], ['nsa', 'ghidra', 2],
    ['ida', 'ida', 5], ['hex-ray', 'ida', 4], ['flirt', 'ida', 3],
    ['pseudocode', 'ida', 3], ['decompil', 'ida', 2],
    ['.net', 'dnspy', 5], ['dotnet', 'dnspy', 5], ['c#', 'dnspy', 4],
    ['managed', 'dnspy', 4], ['csharp', 'dnspy', 4], ['dnspy', 'dnspy', 5],
    ['debug', 'x64dbg', 3], ['dynamic', 'x64dbg', 3], ['breakpoint', 'x64dbg', 3],
    ['x64dbg', 'x64dbg', 5], ['windows', 'x64dbg', 2], ['runtime', 'x64dbg', 2],
    ['network', 'ws', 3], ['packet', 'ws', 4], ['pcap', 'ws', 5],
    ['wireshark', 'ws', 5], ['traffic', 'ws', 3], ['protocol', 'ws', 2],
    ['tls', 'ws', 3], ['http', 'ws', 2], ['tcp', 'ws', 2],
    ['can', 'can', 4], ['canbus', 'can', 5], ['automotive', 'can', 4],
    ['dbc', 'can', 4], ['savvycan', 'can', 5], ['vehicle', 'can', 3],
    ['uds', 'can', 4], ['obd', 'can', 3],
    ['serial', 'spm', 4], ['uart', 'spm', 5], ['com port', 'spm', 5],
    ['rs-232', 'spm', 5], ['iot', 'spm', 2], ['embedded', 'spm', 2],
  ];

  for (const [kw, toolId, score] of scoreKeywords) {
    if (combined.includes(kw)) {
      toolScores.set(toolId, (toolScores.get(toolId) ?? 0) + score);
    }
  }

  if (domain) {
    for (const tool of RE_TOOLS) {
      if (tool.domains.includes(domain)) {
        toolScores.set(tool.id, (toolScores.get(tool.id) ?? 0) + 2);
      }
    }
  }

  let recommendedTools: ToolId[];
  if (forcedTools && forcedTools.length > 0) {
    recommendedTools = forcedTools;
  } else {
    const sorted = Array.from(toolScores.entries())
      .sort((a, b) => b[1] - a[1])
      .filter(([, s]) => s > 0)
      .map(([id]) => id);
    recommendedTools = sorted.length > 0 ? sorted.slice(0, 4) : ['ghidra', 'x64dbg'];
  }

  const workflowSteps = buildWorkflowSteps(task, recommendedTools);
  const memoryKey = `re-swarm-${Date.now()}`;
  const swarmId = `swarm-re-${Math.random().toString(36).slice(2, 8)}`;

  const agentNotes = [
    `Analyzed task: "${task}"`,
    domain ? `Domain filter: ${domain}` : null,
    `Recommended ${recommendedTools.length} tool(s) based on keyword relevance.`,
    'Use re_workflow/get_tool for detailed config, hotkeys, and handoff procedures.',
    'Use re_workflow/memory_store to persist findings from this analysis.',
  ].filter(Boolean).join('\n');

  const result: SwarmAnalysisResult = {
    swarmId,
    task,
    recommendedTools,
    workflowSteps,
    agentNotes,
    memoryKey,
  };

  const lines: string[] = [
    `Swarm Analysis: ${swarmId}`,
    '─'.repeat(60),
    `Task: ${task}`,
    `Recommended Tools: ${recommendedTools.map(id => RE_TOOLS_MAP[id]?.name ?? id).join(', ')}`,
    '',
    'Workflow Steps:',
    ...workflowSteps.map((s, i) => `  ${i + 1}. ${s}`),
    '',
    'Agent Notes:',
    ...agentNotes.split('\n').map(l => `  ${l}`),
    '',
    `Memory Key: ${memoryKey}`,
    '',
    'Note: Swarm analysis generated. Use re_workflow/memory_store to persist findings.',
  ];

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

// ============================================================================
// Tool 5: re_workflow/memory_store
// ============================================================================

export async function memoryStore(input: {
  key: string;
  namespace?: string;
  data: Record<string, unknown>;
}): Promise<MCPToolResult> {
  const { key, namespace = 'default', data } = input;
  const dir = join(homedir(), '.claude-flow', 're-workflow', namespace);
  const filePath = join(dir, `${key}.json`);

  try {
    await fs.mkdir(dir, { recursive: true });
    const entry = { key, namespace, data, timestamp: new Date().toISOString() };
    await fs.writeFile(filePath, JSON.stringify(entry, null, 2), 'utf8');
    return {
      content: [{
        type: 'text',
        text: `Stored: ${filePath}\nKey: ${key}\nNamespace: ${namespace}\nTimestamp: ${entry.timestamp}`,
      }],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `Error storing memory: ${msg}` }],
      isError: true,
    };
  }
}

// ============================================================================
// Tool 6: re_workflow/memory_retrieve
// ============================================================================

export async function memoryRetrieve(input: {
  key: string;
  namespace?: string;
}): Promise<MCPToolResult> {
  const { key, namespace = 'default' } = input;
  const filePath = join(homedir(), '.claude-flow', 're-workflow', namespace, `${key}.json`);

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const entry = JSON.parse(raw) as { key: string; namespace: string; data: unknown; timestamp: string };
    const lines = [
      `Retrieved: ${filePath}`,
      `Key: ${entry.key}  Namespace: ${entry.namespace}  Timestamp: ${entry.timestamp}`,
      '',
      'Data:',
      JSON.stringify(entry.data, null, 2),
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  } catch (err) {
    const isNotFound = err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOENT';
    const msg = isNotFound
      ? `Entry not found: key="${key}" namespace="${namespace}"`
      : `Error retrieving memory: ${err instanceof Error ? err.message : String(err)}`;
    return { content: [{ type: 'text', text: msg }], isError: true };
  }
}

// ============================================================================
// Helpers
// ============================================================================

function padR(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const r of results) {
    const key = `${r.toolId}:${r.tab}:${r.field}:${r.snippet}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function buildWorkflowSteps(task: string, tools: ToolId[]): string[] {
  const steps: string[] = [];
  const toolNames = tools.map(id => RE_TOOLS_MAP[id]?.name ?? id);

  if (toolNames.length === 0) return ['No tools matched — broaden the task description'];

  const taskLower = task.toLowerCase();

  if (toolNames.length === 1) {
    const t = toolNames[0];
    steps.push(`Open target in ${t}`);
    steps.push(`Perform initial triage and identify key entry points`);
    steps.push(`Document findings and annotate symbols`);
    steps.push(`Export analysis artifacts for reporting`);
    return steps;
  }

  toolNames.forEach((name, i) => {
    if (i === 0) {
      steps.push(`Load target into ${name} for initial ${taskLower.includes('network') || taskLower.includes('packet') ? 'capture' : 'analysis'}`);
    } else if (i === toolNames.length - 1) {
      steps.push(`Finalize analysis in ${name}; correlate all collected artifacts`);
    } else {
      const prev = toolNames[i - 1];
      steps.push(`Hand off artifacts from ${prev} → ${name}; deepen analysis`);
    }
  });

  steps.push('Document findings: annotate symbols, save memory entries, export report');

  return steps;
}
