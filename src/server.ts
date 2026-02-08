/**
 * ChainVue Signer MCP Server
 *
 * A local MCP server for secure Verus transaction signing.
 * Private keys never leave this process.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { allTools } from './tools/index.js';

const VERSION = '1.0.0';

export function createServer() {
  const server = new Server(
    {
      name: 'chainvue-signer',
      version: VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: allTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }

    try {
      const result = await tool.handler(args as any);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Return error as content (not throwing) for better UX
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ success: false, error: message }, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

export async function runServer() {
  const server = createServer();
  const transport = new StdioServerTransport();

  console.error('[ChainVue Signer] Starting MCP server...');
  console.error('[ChainVue Signer] Tools available:', allTools.map((t) => t.name).join(', '));

  await server.connect(transport);

  console.error('[ChainVue Signer] Server running on stdio');

  // Handle shutdown gracefully
  process.on('SIGINT', async () => {
    console.error('[ChainVue Signer] Shutting down...');
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.error('[ChainVue Signer] Shutting down...');
    await server.close();
    process.exit(0);
  });
}
