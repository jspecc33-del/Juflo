/**
 * Lightweight MCP (Model Context Protocol) server implementation.
 * Supports stdio and HTTP transports.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { spawn } from 'child_process';
import { JsonRpcMessage, McpTool, McpServerCapabilities, McpServerInfo } from './types';

export type ToolHandler = (args: Record<string, unknown>) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>;

export class McpServer {
  private tools = new Map<string, { schema: Record<string, unknown>; handler: ToolHandler }>();
  private serverInfo: McpServerInfo;
  private capabilities: McpServerCapabilities;
  private initialized = false;

  constructor(name: string, version: string) {
    this.serverInfo = { name, version };
    this.capabilities = { tools: { listChanged: false } };
  }

  registerTool(name: string, description: string, schema: Record<string, unknown>, handler: ToolHandler): void {
    this.tools.set(name, { schema: { ...schema, description }, handler });
  }

  private makeResult(id: number | string | null | undefined, result: unknown): JsonRpcMessage {
    return { jsonrpc: '2.0', id: id ?? null, result };
  }

  private makeError(id: number | string | null | undefined, code: number, message: string): JsonRpcMessage {
    return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
  }

  private async handleRequest(msg: JsonRpcMessage): Promise<JsonRpcMessage | null> {
    if (!msg.method) {
      return this.makeError(msg.id, -32600, 'Invalid Request: missing method');
    }

    // Notifications have no id
    const isNotification = msg.id === undefined;

    switch (msg.method) {
      case 'initialize': {
        this.initialized = true;
        if (isNotification) return null;
        return this.makeResult(msg.id, {
          protocolVersion: '2024-11-05',
          capabilities: this.capabilities,
          serverInfo: this.serverInfo,
        });
      }

      case 'initialized': {
        // Client initialized notification — no response
        return null;
      }

      case 'tools/list': {
        if (!this.initialized) {
          return this.makeError(msg.id, -32002, 'Server not initialized');
        }
        if (isNotification) return null;
        const tools: McpTool[] = [];
        for (const [name, { schema }] of this.tools) {
          tools.push({ name, description: (schema.description as string) || '', inputSchema: schema });
        }
        return this.makeResult(msg.id, { tools });
      }

      case 'tools/call': {
        if (!this.initialized) {
          return this.makeError(msg.id, -32002, 'Server not initialized');
        }
        if (isNotification) return null;
        const params = msg.params as Record<string, unknown> || {};
        const toolName = params.name as string;
        const toolArgs = (params.arguments as Record<string, unknown>) || {};
        const tool = this.tools.get(toolName);
        if (!tool) {
          return this.makeError(msg.id, -32601, `Tool not found: ${toolName}`);
        }
        try {
          const result = await tool.handler(toolArgs);
          return this.makeResult(msg.id, result);
        } catch (err: any) {
          return this.makeResult(msg.id, {
            content: [{ type: 'text', text: `Error: ${err.message || String(err)}` }],
            isError: true,
          });
        }
      }

      default:
        return this.makeError(msg.id, -32601, `Method not found: ${msg.method}`);
    }
  }

  async runStdio(): Promise<void> {
    const { stdin, stdout } = process;
    stdin.setEncoding('utf-8');

    let buffer = '';
    stdin.on('data', async (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(line);
        } catch {
          stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n');
          continue;
        }
        const response = await this.handleRequest(msg);
        if (response) {
          stdout.write(JSON.stringify(response) + '\n');
        }
      }
    });

    stdin.on('end', () => {
      process.exit(0);
    });

    // Keep alive
    return new Promise(() => {});
  }

  async runHttp(port: number): Promise<void> {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('Content-Type', 'application/json');

      if (req.method !== 'POST') {
        res.statusCode = 405;
        res.end(JSON.stringify({ error: 'Method not allowed' }));
        return;
      }

      let body = '';
      req.setEncoding('utf-8');
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', async () => {
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(body);
        } catch {
          res.statusCode = 400;
          res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
          return;
        }
        const response = await this.handleRequest(msg);
        if (response) {
          res.statusCode = 200;
          res.end(JSON.stringify(response));
        } else {
          res.statusCode = 204;
          res.end();
        }
      });
    });

    return new Promise((resolve) => {
      server.listen(port, () => {
        console.error(`Executor MCP server listening on http://127.0.0.1:${port}/mcp`);
        resolve();
      });
    });
  }
}
