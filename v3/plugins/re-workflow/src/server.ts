#!/usr/bin/env node
import { listTools, getTool, search, swarmAnalyze, memoryStore, memoryRetrieve } from './mcp-tools.js';
import type { ToolId, Domain, TabId } from './types.js';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number | string | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

const TOOLS = [
  {
    name: 're_workflow/list_tools',
    description: 'List all RE tools in the reference, optionally filtered by domain (malware, automotive, iot, network, mobile, firmware)',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', enum: ['malware', 'automotive', 'iot', 'network', 'mobile', 'firmware'] },
      },
    },
  },
  {
    name: 're_workflow/get_tool',
    description: 'Get the full reference for a specific RE tool. Optionally limit to one tab: cfg, hk (hotkeys), ho (handoffs), pr (protocols)',
    inputSchema: {
      type: 'object',
      required: ['toolId'],
      properties: {
        toolId: { type: 'string', enum: ['ghidra','ida','dnspy','x64dbg','ws','can','spm','r2','frida','jadx','binwalk','gdb'] },
        tab: { type: 'string', enum: ['cfg', 'hk', 'ho', 'pr'] },
      },
    },
  },
  {
    name: 're_workflow/search',
    description: 'Search across all RE tools and content tabs. Returns ranked results.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { type: 'string' },
        domain: { type: 'string', enum: ['malware', 'automotive', 'iot', 'network', 'mobile', 'firmware'] },
        tab: { type: 'string', enum: ['cfg', 'hk', 'ho', 'pr'] },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
    },
  },
  {
    name: 're_workflow/swarm_analyze',
    description: 'Recommend RE tools and generate a workflow for a given task. Optionally seed with domain and specific tools.',
    inputSchema: {
      type: 'object',
      required: ['task'],
      properties: {
        task: { type: 'string' },
        domain: { type: 'string', enum: ['malware', 'automotive', 'iot', 'network', 'mobile', 'firmware'] },
        tools: { type: 'array', items: { type: 'string' } },
        context: { type: 'string' },
      },
    },
  },
  {
    name: 're_workflow/memory_store',
    description: 'Persist RE session notes or findings to ~/.claude-flow/re-workflow/<namespace>/<key>.json',
    inputSchema: {
      type: 'object',
      required: ['key', 'data'],
      properties: {
        key: { type: 'string' },
        namespace: { type: 'string' },
        data: { type: 'object' },
      },
    },
  },
  {
    name: 're_workflow/memory_retrieve',
    description: 'Retrieve previously stored RE session notes from ~/.claude-flow/re-workflow/<namespace>/<key>.json',
    inputSchema: {
      type: 'object',
      required: ['key'],
      properties: {
        key: { type: 'string' },
        namespace: { type: 'string' },
      },
    },
  },
];

function ok(id: number | string | null | undefined, result: unknown): JsonRpcMessage {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function err(id: number | string | null | undefined, code: number, message: string): JsonRpcMessage {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

async function dispatch(msg: JsonRpcMessage): Promise<JsonRpcMessage | null> {
  const { method, params, id } = msg;
  const p = (params as Record<string, unknown>) ?? {};

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 're-workflow', version: '0.1.0' },
      });

    case 'initialized':
      return null;

    case 'tools/list':
      return ok(id, { tools: TOOLS });

    case 'tools/call': {
      const name = p.name as string;
      const args = (p.arguments as Record<string, unknown>) ?? {};
      try {
        let result;
        switch (name) {
          case 're_workflow/list_tools':
            result = listTools({ domain: args.domain as Domain | undefined });
            break;
          case 're_workflow/get_tool':
            result = getTool({ toolId: args.toolId as ToolId, tab: args.tab as TabId | undefined });
            break;
          case 're_workflow/search':
            result = search({
              query: args.query as string,
              domain: args.domain as Domain | undefined,
              tab: args.tab as TabId | undefined,
              limit: args.limit as number | undefined,
            });
            break;
          case 're_workflow/swarm_analyze':
            result = await swarmAnalyze({
              task: args.task as string,
              domain: args.domain as Domain | undefined,
              tools: args.tools as ToolId[] | undefined,
              context: args.context as string | undefined,
            });
            break;
          case 're_workflow/memory_store':
            result = await memoryStore({
              key: args.key as string,
              namespace: args.namespace as string | undefined,
              data: args.data as Record<string, unknown>,
            });
            break;
          case 're_workflow/memory_retrieve':
            result = await memoryRetrieve({
              key: args.key as string,
              namespace: args.namespace as string | undefined,
            });
            break;
          default:
            return ok(id, { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true });
        }
        return ok(id, result);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        return ok(id, { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true });
      }
    }

    default:
      return err(id, -32601, `Method not found: ${method}`);
  }
}

async function main() {
  process.stdin.setEncoding('utf-8');
  let buffer = '';

  process.stdin.on('data', async (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      let msg: JsonRpcMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        process.stdout.write(JSON.stringify(err(null, -32700, 'Parse error')) + '\n');
        continue;
      }
      const response = await dispatch(msg);
      if (response) process.stdout.write(JSON.stringify(response) + '\n');
    }
  });

  process.stdin.on('end', () => process.exit(0));
  return new Promise<void>(() => {});
}

main().catch(e => { process.stderr.write(String(e) + '\n'); process.exit(1); });
