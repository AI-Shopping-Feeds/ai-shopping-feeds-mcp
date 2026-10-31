import { createServer as createHttpServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';

export const VALID_KEY = 'asf_test_key';

/** A stand-in for the hosted MCP server, with dotted tool names like the real one. */
export const FAKE_TOOLS: Tool[] = [
  {
    name: 'feeds.list',
    description: 'List feeds.',
    inputSchema: { type: 'object', properties: { brand_id: { type: 'string' } } },
    annotations: { readOnlyHint: true }
  },
  {
    name: 'products.update',
    description: 'Update a product.',
    inputSchema: {
      type: 'object',
      properties: { product_id: { type: 'string' }, confirm: { type: 'boolean' } },
      required: ['product_id', 'confirm']
    },
    annotations: { destructiveHint: true }
  },
  {
    name: 'products.bulk_upsert',
    description: 'Create or update products.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { destructiveHint: true }
  },
  {
    name: 'docs.search',
    description: 'Search the docs.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    annotations: { readOnlyHint: true }
  }
];

export interface FakeUpstream {
  url: URL;
  requests: IncomingHttpHeaders[];
  calls: { name: string; arguments: unknown }[];
  close(): Promise<void>;
}

export async function startFakeUpstream(): Promise<FakeUpstream> {
  const requests: IncomingHttpHeaders[] = [];
  const calls: { name: string; arguments: unknown }[] = [];

  const httpServer: HttpServer = createHttpServer(async (req, res) => {
    requests.push(req.headers);
    if (req.headers.authorization !== `Bearer ${VALID_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Invalid API key' } }));
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    // Stateless, one server per request, as the hosted endpoint works.
    const server = new Server({ name: 'fake-upstream', version: '0.0.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: FAKE_TOOLS }));
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      calls.push({ name: request.params.name, arguments: request.params.arguments });
      if (request.params.name === 'products.update' && request.params.arguments?.confirm !== true) {
        return { content: [{ type: 'text', text: 'confirm must be true for this operation' }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ tool: request.params.name, args: request.params.arguments }) }]
      };
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, JSON.parse(body));
  });

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const { port } = httpServer.address() as AddressInfo;

  return {
    url: new URL(`http://127.0.0.1:${port}/api/v1/mcp`),
    requests,
    calls,
    close: () =>
      new Promise((resolve) => {
        httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      })
  };
}
