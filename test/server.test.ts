import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { Client } from '@modelcontextprotocol/client';
import type { CallToolResult, Progress } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { loadConfig } from '../src/config.js';
import { createServer, isExposed, toLocalName, toolGroup } from '../src/server.js';
import { FAKE_TOOLS, startFakeUpstream, VALID_KEY, type FakeUpstream, type FakeUpstreamMode } from './fakeUpstream.js';

type ClientEra = 'legacy' | 'modern';

/**
 * Serves the bridge through serveStdio, as dist/index.js does, over an
 * in-memory pair, and connects a real client in the given protocol era.
 */
async function connect(upstream: FakeUpstream, era: ClientEra, env: Record<string, string> = {}, argv: string[] = []) {
  const config = loadConfig(
    { AI_SHOPPING_FEEDS_API_KEY: VALID_KEY, AI_SHOPPING_FEEDS_API_URL: upstream.url.href, ...env },
    argv
  );
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createServer(config), { transport: serverTransport });
  const client = new Client(
    { name: 'test-client', version: '0.0.0' },
    era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {}
  );
  await client.connect(clientTransport);
  expect(client.getProtocolEra()).toBe(era);
  return {
    client,
    close: async () => {
      await client.close();
      await handle.close();
    }
  };
}

function text(result: CallToolResult): string {
  return result.content.map((part) => (part.type === 'text' ? part.text : '')).join('');
}

describe('tool names and filters', () => {
  it('turns dotted names into ones every client accepts', () => {
    expect(toLocalName('feeds.list')).toBe('feeds_list');
    expect(toLocalName('products.bulk_upsert')).toBe('products_bulk_upsert');
    expect(toolGroup('products.bulk_upsert')).toBe('products');
  });

  it('filters by read-only hint and group', () => {
    const [feedsList, productsUpdate] = FAKE_TOOLS;
    expect(isExposed(productsUpdate, { readOnly: true, toolGroups: [] })).toBe(false);
    expect(isExposed(feedsList, { readOnly: true, toolGroups: [] })).toBe(true);
    expect(isExposed(feedsList, { readOnly: false, toolGroups: ['products'] })).toBe(false);
  });
});

const ALL_LOCAL_NAMES = FAKE_TOOLS.map((tool) => toLocalName(tool.name));
const READ_ONLY_NAMES = ['feeds_list', 'docs_search', 'exports_run'];

const matrix: [FakeUpstreamMode, ClientEra][] = [
  ['modern', 'legacy'],
  ['modern', 'modern'],
  ['legacy', 'legacy'],
  ['legacy', 'modern']
];

describe.each(matrix)('proxy to a %s hosted server, for a %s client', (upstreamMode, clientEra) => {
  let upstream: FakeUpstream;
  const open = (env?: Record<string, string>, argv?: string[]) => connect(upstream, clientEra, env, argv);

  beforeAll(async () => {
    upstream = await startFakeUpstream({ mode: upstreamMode, pageSize: 4 });
  });

  afterAll(async () => {
    await upstream.close();
  });

  it('negotiates the protocol era the hosted server speaks', async () => {
    const { client, close } = await open();
    const before = upstream.eras.length;
    await client.listTools();
    const eras = upstream.eras.slice(before);
    expect(eras.length).toBeGreaterThan(0);
    expect(new Set(eras)).toEqual(new Set([upstreamMode]));
    if (upstreamMode === 'modern') {
      expect(upstream.requests.at(-1)?.['mcp-protocol-version']).toBe('2026-07-28');
    }
    await close();
  });

  it('lists the hosted tools under local names, otherwise untouched, across pages', async () => {
    const { client, close } = await open();
    const pagesBefore = upstream.pages.length;
    const { tools } = await client.listTools();
    expect(upstream.pages.slice(pagesBefore)).toEqual(['', '4']);
    expect(tools.map((tool) => tool.name)).toEqual(ALL_LOCAL_NAMES);
    expect(tools).toEqual(FAKE_TOOLS.map((tool) => ({ ...tool, name: toLocalName(tool.name) })));
    expect(client.getInstructions()).toMatch(/confirm: true/);
    expect(client.getServerVersion()?.name).toBe('ai-shopping-feeds');
    await close();
  });

  it('sends the API key and a user agent', async () => {
    const { client, close } = await open();
    await client.listTools();
    const last = upstream.requests.at(-1);
    expect(last?.authorization).toBe(`Bearer ${VALID_KEY}`);
    expect(last?.['user-agent']).toMatch(/^@ai-shopping-feeds\/mcp\//);
    await close();
  });

  it('calls the hosted tool by its real name and passes arguments through', async () => {
    const { client, close } = await open();
    const result = await client.callTool({ name: 'products_update', arguments: { product_id: 'p1', confirm: true } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({ tool: 'products.update', args: { product_id: 'p1', confirm: true } });
    expect(upstream.calls.at(-1)?.name).toBe('products.update');
    await close();
  });

  it('passes structured content through', async () => {
    const { client, close } = await open();
    await client.listTools();
    const result = await client.callTool({ name: 'feeds_list', arguments: {} });
    expect(result.structuredContent).toEqual({ feeds: ['feed-1', 'feed-2'] });
    await close();
  });

  it('works when a client calls a tool without listing first', async () => {
    const { client, close } = await open();
    const result = await client.callTool({ name: 'docs_search', arguments: { query: 'gtin' } });
    expect(JSON.parse(text(result)).tool).toBe('docs.search');
    await close();
  });

  it('passes hosted tool errors back as tool errors', async () => {
    const { client, close } = await open();
    const result = await client.callTool({ name: 'products_update', arguments: { product_id: 'p1' } });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/confirm must be true/);
    await close();
  });

  it('relays progress under the client\'s token, always moving forward', async () => {
    const { client, close } = await open();
    const updates: Progress[] = [];
    const result = await client.callTool(
      { name: 'feeds_refresh', arguments: { feed_id: 'f1' } },
      { onprogress: (update) => updates.push(update) }
    );
    expect(result.isError).toBeFalsy();
    // The hosted server got a token of its own and reported 1, 2, 2, 3.
    expect(JSON.parse(text(result)).progressToken).toBeDefined();
    expect(updates).toEqual([
      { progress: 1, total: 3, message: 'Step 1' },
      { progress: 2, total: 3, message: 'Step 2' },
      { progress: 3, total: 3, message: 'Step 3' }
    ]);
    await close();
  });

  it('asks the hosted server for no progress when the client did not', async () => {
    const { client, close } = await open();
    const result = await client.callTool({ name: 'feeds_refresh', arguments: { feed_id: 'f1' } });
    expect(JSON.parse(text(result)).progressToken).toBeUndefined();
    await close();
  });

  it('cancels the hosted call when the client cancels', async () => {
    const { client, close } = await open();
    await client.listTools();
    const controller = new AbortController();
    const started = upstream.waitForCall('exports.run');
    const call = client.callTool({ name: 'exports_run', arguments: {} }, { signal: controller.signal });
    await started;
    const cancelledBefore = upstream.cancelled.length;
    controller.abort('the person clicked Stop');
    await expect(call).rejects.toThrow(/clicked Stop/);
    await vi.waitFor(() => expect(upstream.cancelled.length).toBe(cancelledBefore + 1), { timeout: 5_000 });
    await close();
  });

  it('cancels the hosted call when the client disconnects', async () => {
    const { client, close } = await open();
    await client.listTools();
    const started = upstream.waitForCall('exports.run');
    const call = client.callTool({ name: 'exports_run', arguments: {} }).catch(() => undefined);
    await started;
    const cancelledBefore = upstream.cancelled.length;
    await close();
    await call;
    await vi.waitFor(() => expect(upstream.cancelled.length).toBe(cancelledBefore + 1), { timeout: 5_000 });
  });

  it('hides write tools in read-only mode and refuses to call them', async () => {
    const { client, close } = await open({}, ['--read-only']);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(READ_ONLY_NAMES);
    const callsBefore = upstream.calls.length;
    const result = await client.callTool({ name: 'products_update', arguments: { product_id: 'p1', confirm: true } });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Unknown tool: products_update\. It may be hidden by --read-only or --tools/);
    expect(upstream.calls.length).toBe(callsBefore);
    await close();
  });

  it('limits tools to the chosen groups', async () => {
    const { client, close } = await open({ AI_SHOPPING_FEEDS_TOOLS: 'products' });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['products_update', 'products_bulk_upsert']);
    await close();
  });

  it('reconnects when the hosted server has forgotten the session (404)', async () => {
    const { client, close } = await open();
    await client.listTools();
    upstream.failNext(404);
    const result = await client.callTool({ name: 'docs_search', arguments: { query: 'gtin' } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result)).tool).toBe('docs.search');
    await close();
  });

  it.each([
    [403, /refused the request for this API key \(403\)/],
    [429, /rate limit reached/],
    [503, /not responding properly \(HTTP 503\)/]
  ])('explains an HTTP %i from the hosted server', async (status, message) => {
    const { client, close } = await open();
    await client.listTools();
    upstream.failNext(status);
    const result = await client.callTool({ name: 'docs_search', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(message);
    await close();
  });

  it('explains a rejected API key on list and on call', async () => {
    const { client, close } = await open({ AI_SHOPPING_FEEDS_API_KEY: 'asf_wrong' });
    await expect(client.listTools()).rejects.toThrow(/did not accept the API key/);
    const result = await client.callTool({ name: 'feeds_list', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/did not accept the API key/);
    expect(text(result)).not.toContain('asf_wrong');
    await close();
  });

  it('explains an unreachable server', async () => {
    const { client, close } = await open({ AI_SHOPPING_FEEDS_API_URL: 'http://127.0.0.1:9/api/v1/mcp' });
    const result = await client.callTool({ name: 'feeds_list', arguments: {} });
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Could not reach AI Shopping Feeds/);
    await close();
  });
});
