/**
 * exec_chain — Chain multiple MCP tool calls across servers in sequence.
 */
import { spawn } from 'child_process';
import { ChainArgs, SandboxConfig, ToolResult, JsonRpcMessage } from '../types';
import { buildToolResult, truncateOutput } from '../utils';

export const name = 'exec_chain';
export const description = 'Chain multiple MCP tool calls across servers in sequence. Each step spawns a fresh MCP subprocess.';
export const inputSchema = {
  type: 'object',
  properties: {
    description: { type: 'string', description: 'Human-readable description of the chain' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step_id: { type: 'string', description: 'Unique step identifier' },
          server_command: { type: 'string', description: 'Command to launch the MCP server' },
          tool_name: { type: 'string', description: 'Tool to call on the server' },
          arguments: { type: 'object', description: 'Tool arguments' },
          on_error: {
            type: 'string',
            enum: ['abort', 'continue'],
            description: 'Behavior when this step fails',
          },
        },
        required: ['step_id', 'server_command', 'tool_name', 'arguments', 'on_error'],
      },
      maxItems: 10,
      description: 'Ordered list of steps (max 10)',
    },
  },
  required: ['description', 'steps'],
};

interface StepResult {
  step_id: string;
  success: boolean;
  output: string;
  error?: string;
}

async function callMcpTool(
  serverCommand: string,
  toolName: string,
  args: Record<string, unknown>,
  timeoutMs: number
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    const parts = serverCommand.split(/\s+/);
    const cmd = parts[0];
    const cmdArgs = parts.slice(1);
    const child = spawn(cmd, cmdArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill('SIGTERM');
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 3000);
        resolve({ success: false, output: '', error: `Step timed out after ${timeoutMs}ms` });
      }
    }, timeoutMs);

    child.stdout?.setEncoding('utf-8');
    child.stdout?.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr?.setEncoding('utf-8');
    child.stderr?.on('data', (chunk: string) => { stderr += chunk; });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        resolve({ success: false, output: '', error: `Spawn error: ${err.message}` });
      }
    });

    child.on('close', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      // Parse JSON-RPC responses from stdout lines
      const lines = stdout.split('\n').filter((l) => l.trim());
      let initOk = false;
      let toolResult: ToolResult | null = null;
      let parseError: string | null = null;

      for (const line of lines) {
        let msg: JsonRpcMessage;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.result && (msg.result as any).protocolVersion) {
          initOk = true;
        } else if (msg.result && (msg.result as any).content) {
          toolResult = msg.result as ToolResult;
        } else if (msg.error) {
          parseError = (msg.error as any).message || JSON.stringify(msg.error);
        }
      }

      if (!initOk) {
        resolve({ success: false, output: '', error: `MCP server did not initialize. STDERR: ${stderr.slice(0, 500)}` });
        return;
      }

      if (parseError) {
        resolve({ success: false, output: '', error: parseError });
        return;
      }

      if (toolResult) {
        const text = toolResult.content.map((c) => c.text).join('\n');
        resolve({ success: !toolResult.isError, output: text, error: toolResult.isError ? text : undefined });
      } else {
        resolve({ success: false, output: '', error: `No tool result received. STDOUT: ${stdout.slice(0, 500)}` });
      }
    });

    // Send initialize
    const initMsg: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'executor-chain', version: '1.0.0' } },
    };
    child.stdin?.write(JSON.stringify(initMsg) + '\n');

    // Send initialized notification
    const notif: JsonRpcMessage = {
      jsonrpc: '2.0',
      method: 'initialized',
      params: {},
    };
    child.stdin?.write(JSON.stringify(notif) + '\n');

    // Send tools/call
    const callMsg: JsonRpcMessage = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: toolName, arguments: args },
    };
    child.stdin?.write(JSON.stringify(callMsg) + '\n');
    child.stdin?.end();
  });
}

export async function handler(args: Record<string, unknown>, config: SandboxConfig): Promise<ToolResult> {
  const params = args as unknown as ChainArgs;
  const results: StepResult[] = [];
  let aborted = false;

  for (const step of params.steps) {
    if (aborted) {
      results.push({ step_id: step.step_id, success: false, output: '', error: 'Skipped — chain aborted by previous failure' });
      continue;
    }

    const stepResult = await callMcpTool(
      step.server_command,
      step.tool_name,
      step.arguments,
      config.defaultTimeoutMs
    );

    results.push({
      step_id: step.step_id,
      success: stepResult.success,
      output: stepResult.output,
      error: stepResult.error,
    });

    if (!stepResult.success && step.on_error === 'abort') {
      aborted = true;
    }
  }

  const text = results
    .map((r) => {
      let s = `--- ${r.step_id} ---\n`;
      s += `SUCCESS: ${r.success}\n`;
      if (r.output) s += `OUTPUT:\n${truncateOutput(r.output, config.maxOutputBytes)}\n`;
      if (r.error) s += `ERROR:\n${r.error}\n`;
      return s;
    })
    .join('\n');

  const anyError = results.some((r) => !r.success);
  return buildToolResult(text, anyError);
}
