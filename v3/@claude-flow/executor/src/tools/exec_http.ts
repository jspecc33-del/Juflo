/**
 * exec_http — Make HTTP API calls with domain filtering.
 */
import { HttpArgs, SandboxConfig, ToolResult } from '../types';
import { buildToolResult, truncateOutput } from '../utils';
import { checkDomain } from '../security';

export const name = 'exec_http';
export const description = 'Make HTTP API calls (REST, webhooks, etc.) with automatic JSON serialization and domain policies.';
export const inputSchema = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'Request URL' },
    method: {
      type: 'string',
      enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'],
      description: 'HTTP method',
    },
    headers: {
      type: 'object',
      additionalProperties: { type: 'string' },
      description: 'Request headers',
    },
    body: { description: 'Request body (auto-serialized to JSON if object)' },
    timeout_ms: { type: 'number', description: 'Timeout in milliseconds' },
    response_format: {
      type: 'string',
      enum: ['auto', 'json', 'text'],
      description: 'How to parse the response body',
    },
  },
  required: ['url'],
};

export async function handler(args: Record<string, unknown>, config: SandboxConfig): Promise<ToolResult> {
  const params = args as unknown as HttpArgs;
  const url = params.url;
  const method = (params.method || 'GET').toUpperCase() as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  const timeout = params.timeout_ms ?? config.defaultTimeoutMs;
  const responseFormat = params.response_format || 'auto';

  try {
    checkDomain(url, config);
  } catch (err: any) {
    return buildToolResult(`Security check failed: ${err.message}`, true);
  }

  const headers: Record<string, string> = { ...params.headers };
  let body: string | undefined;
  if (params.body !== undefined) {
    if (typeof params.body === 'object') {
      body = JSON.stringify(params.body);
      headers['Content-Type'] = headers['Content-Type'] || 'application/json';
    } else {
      body = String(params.body);
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let responseText: string;
  let status: number;
  let responseHeaders: Record<string, string> = {};

  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    status = response.status;
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    const rawBody = await response.text();
    if (responseFormat === 'json' || (responseFormat === 'auto' && response.headers.get('content-type')?.includes('application/json'))) {
      try {
        const parsed = JSON.parse(rawBody);
        responseText = JSON.stringify(parsed, null, 2);
      } catch {
        responseText = rawBody;
      }
    } else {
      responseText = rawBody;
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    return buildToolResult(`HTTP error: ${err.message || String(err)}`, true);
  }

  const text = `STATUS: ${status}\nHEADERS:\n${JSON.stringify(responseHeaders, null, 2)}\nBODY:\n${truncateOutput(responseText, config.maxOutputBytes)}`;
  return buildToolResult(text, status >= 400);
}
