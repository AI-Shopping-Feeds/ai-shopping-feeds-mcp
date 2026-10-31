import { createServer as createHttpServer, type IncomingHttpHeaders, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import { NodeStreamableHTTPServerTransport, toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, Server } from '@modelcontextprotocol/server';
import type { ServerContext, Tool } from '@modelcontextprotocol/server';

export const VALID_KEY = 'asf_test_key';

/** A stand-in for the hosted MCP server, with dotted tool names like the real one. */
export const FAKE_TOOLS: Tool[] = [
  {
    name: 'feeds.list',
    title: 'List feeds',
    description: 'List feeds.',
    inputSchema: { type: 'object', properties: { brand_id: { type: 'string' } } },
    outputSchema: {
      type: 'object',
      properties: { feeds: { type: 'array', items: { type: 'string' } } },
      required: ['feeds']
    },
    annotations: { title: 'List feeds', readOnlyHint: true, openWorldHint: false },
    _meta: { 'aishoppingfeeds.com/scope': 'feeds:read' }
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
  },
  {
    name: 'feeds.refresh',
    description: 'Refresh a feed, reporting progress.',
    inputSchema: { type: 'object', properties: { feed_id: { type: 'string' } } },
    annotations: { readOnlyHint: false }
  },
  {
    name: 'exports.run',
    description: 'A slow export that runs until it is cancelled.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true }
  }
];

/** Progress values feeds.refresh reports. The repeated 2 is dropped by the bridge. */
export const REFRESH_PROGRESS = [1, 2, 2, 3];

export type FakeUpstreamMode =
  /** Serves 2026-07-28 and 2025-era clients, through createMcpHandler. */
  | 'modern'
  /** Serves 2025-era clients only, statelessly, like a v1 SDK deployment. */
  | 'legacy';

export interface FakeUpstreamOptions {
  mode?: FakeUpstreamMode;
  /** Tools per tools/list page. */
  pageSize?: number;
  /** Set to false to leave the tools capability out, as a misconfigured server might. */
  toolsCapability?: boolean;
}

export interface FakeUpstream {
  url: URL;
  mode: FakeUpstreamMode;
  requests: IncomingHttpHeaders[];
  calls: { name: string; arguments: unknown }[];
  /** The protocol era of each server instance the fake built. */
  eras: string[];
  /** Names of tool calls whose abort signal fired. */
  cancelled: string[];
  /** The listed pages, by cursor ('' for the first). */
  pages: string[];
  /** Answers the next HTTP request with this status instead of serving it. */
  failNext(status: number): void;
  /** Resolves when a call to this tool has started. */
  waitForCall(name: string): Promise<void>;
  close(): Promise<void>;
}

export async function startFakeUpstream(options: FakeUpstreamOptions = {}): Promise<FakeUpstream> {
  const mode = options.mode ?? 'modern';
  const pageSize = options.pageSize ?? 4;
  const capabilities = options.toolsCapability === false ? {} : { tools: {} };
  const requests: IncomingHttpHeaders[] = [];
  const calls: { name: string; arguments: unknown }[] = [];
  const eras: string[] = [];
  const cancelled: string[] = [];
  const pages: string[] = [];
  const failures: number[] = [];
  const callWaiters: { name: string; resolve: () => void }[] = [];

  function onCall(name: string, args: unknown) {
    calls.push({ name, arguments: args });
    for (const waiter of callWaiters.filter((w) => w.name === name)) {
      callWaiters.splice(callWaiters.indexOf(waiter), 1);
      waiter.resolve();
    }
  }

  function buildServer(era: string): Server {
    eras.push(era);
    const server = new Server({ name: 'fake-upstream', version: '0.0.0' }, { capabilities });
    if (!('tools' in capabilities)) return server;

    server.setRequestHandler('tools/list', async (request) => {
      const cursor = request.params?.cursor ?? '';
      pages.push(cursor);
      const start = cursor ? Number(cursor) : 0;
      const end = start + pageSize;
      return {
        tools: FAKE_TOOLS.slice(start, end),
        ...(end < FAKE_TOOLS.length ? { nextCursor: String(end) } : {})
      };
    });

    server.setRequestHandler('tools/call', async (request, ctx: ServerContext) => {
      const { name, arguments: args } = request.params;
      onCall(name, args);
      if (name === 'products.update' && args?.confirm !== true) {
        return { content: [{ type: 'text', text: 'confirm must be true for this operation' }], isError: true };
      }
      if (name === 'feeds.list') {
        const feeds = ['feed-1', 'feed-2'];
        return { content: [{ type: 'text', text: JSON.stringify({ tool: name, args }) }], structuredContent: { feeds } };
      }
      if (name === 'feeds.refresh') {
        const progressToken = ctx.mcpReq._meta?.progressToken;
        if (progressToken !== undefined) {
          // Sent back to back with the result, so they tend to arrive in one chunk.
          await Promise.all(
            REFRESH_PROGRESS.map((progress) =>
              ctx.mcpReq.notify({
                method: 'notifications/progress',
                params: { progressToken, progress, total: 3, message: `Step ${progress}` }
              })
            )
          );
        }
        return { content: [{ type: 'text', text: JSON.stringify({ tool: name, args, progressToken }) }] };
      }
      if (name === 'exports.run') {
        const signal = ctx.mcpReq.signal;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 20_000);
          const onAbort = () => {
            cancelled.push(name);
            clearTimeout(timer);
            resolve();
          };
          if (signal.aborted) onAbort();
          else signal.addEventListener('abort', onAbort, { once: true });
        });
        return { content: [{ type: 'text', text: 'export finished' }] };
      }
      return { content: [{ type: 'text', text: JSON.stringify({ tool: name, args }) }] };
    });

    return server;
  }

  const modern = mode === 'modern' ? toNodeHandler(createMcpHandler(({ era }) => buildServer(era))) : null;

  const httpServer: HttpServer = createHttpServer(async (req, res) => {
    requests.push(req.headers);
    if (req.headers.authorization !== `Bearer ${VALID_KEY}`) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Invalid API key' } }));
      return;
    }
    const failure = failures.shift();
    if (failure !== undefined) {
      res.writeHead(failure, { 'content-type': 'text/plain' }).end(`Failed with ${failure}`);
      return;
    }
    if (modern) {
      await modern(req, res);
      return;
    }
    if (req.method !== 'POST') {
      res.writeHead(405).end();
      return;
    }
    let body = '';
    for await (const chunk of req) body += chunk;
    // Stateless, one server per request, as a 2025-era hosted endpoint works.
    const server = buildServer('legacy');
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
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
    mode,
    requests,
    calls,
    eras,
    cancelled,
    pages,
    failNext: (status) => {
      failures.push(status);
    },
    waitForCall: (name) => new Promise((resolve) => callWaiters.push({ name, resolve })),
    close: () =>
      new Promise((resolve) => {
        httpServer.closeAllConnections();
        httpServer.close(() => resolve());
      })
  };
}
