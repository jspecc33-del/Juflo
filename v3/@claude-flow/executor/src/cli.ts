#!/usr/bin/env node
/**
 * @claude-flow/executor CLI entry point.
 * Universal sandboxed execution: bash, code, HTTP, tool chaining.
 */
import { McpServer } from './mcp.js';
import { getConfig } from './utils.js';
import { ensureSandbox } from './sandbox.js';

import * as execBash from './tools/exec_bash.js';
import * as execCode from './tools/exec_code.js';
import * as execHttp from './tools/exec_http.js';
import * as execChain from './tools/exec_chain.js';
import * as execSandboxInfo from './tools/exec_sandbox_info.js';

async function main() {
  const config = getConfig();
  await ensureSandbox(config);

  const server = new McpServer('executor-mcp-server', '1.0.0');

  server.registerTool(execBash.name, execBash.description, execBash.inputSchema, (args) =>
    execBash.handler(args, config)
  );
  server.registerTool(execCode.name, execCode.description, execCode.inputSchema, (args) =>
    execCode.handler(args, config)
  );
  server.registerTool(execHttp.name, execHttp.description, execHttp.inputSchema, (args) =>
    execHttp.handler(args, config)
  );
  server.registerTool(execChain.name, execChain.description, execChain.inputSchema, (args) =>
    execChain.handler(args, config)
  );
  server.registerTool(execSandboxInfo.name, execSandboxInfo.description, execSandboxInfo.inputSchema, (args) =>
    execSandboxInfo.handler(args, config)
  );

  if (config.transport === 'http') {
    await server.runHttp(config.httpPort);
  } else {
    await server.runStdio();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
