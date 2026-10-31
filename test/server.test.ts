import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import { loadConfig } from '../src/config.js';
import { createServer, isExposed, toLocalName, toolGroup } from '../src/server.js';
import { FAKE_TOOLS, startFakeUpstream, VALID_KEY, type FakeUpstream } from './fakeUpstream.js';

let upstream: FakeUpstream;

beforeAll(async () => {
  upstream = await startFakeUpstream();
});

afterAll(async () => {
  await upstream.close();
});

async function connect(env: Record<string, string> = {}, argv: string[] = []) {
  const config = loadConfig(
    { AI_SHOPPING_FEEDS_API_KEY: VALID_KEY, AI_SHOPPING_FEEDS_API_URL: upstream.url.href, ...env },
    argv
  );
  const server = createServer(config);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: () => client.close() };
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

describe('proxy to the hosted server', () => {
  it('lists the hosted tools under local names, with their schemas and hints', async () => {
    const { client, close } = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['feeds_list', 'products_update', 'products_bulk_upsert', 'docs_search']);
    const update = tools.find((tool) => tool.name === 'products_update');
    expect(update?.inputSchema.required).toEqual(['product_id', 'confirm']);
    expect(update?.annotations?.destructiveHint).toBe(true);
    expect(client.getInstructions()).toMatch(/confirm: true/);
    await close();
  });

  it('sends the API key and a user agent', async () => {
    const { client, close } = await connect();
    await client.listTools();
    const last = upstream.requests.at(-1);
    expect(last?.authorization).toBe(`Bearer ${VALID_KEY}`);
    expect(last?.['user-agent']).toMatch(/^@ai-shopping-feeds\/mcp\//);
    await close();
  });

  it('calls the hosted tool by its real name and passes arguments through', async () => {
    const { client, close } = await connect();
    const result = (await client.callTool({
      name: 'products_update',
      arguments: { product_id: 'p1', confirm: true }
    })) as CallToolResult;
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({ tool: 'products.update', args: { product_id: 'p1', confirm: true } });
    expect(upstream.calls.at(-1)?.name).toBe('products.update');
    await close();
  });

  it('works when a client calls a tool without listing first', async () => {
    const { client, close } = await connect();
    const result = (await client.callTool({ name: 'feeds_list', arguments: {} })) as CallToolResult;
    expect(JSON.parse(text(result)).tool).toBe('feeds.list');
    await close();
  });

  it('passes hosted tool errors back as tool errors', async () => {
    const { client, close } = await connect();
    const result = (await client.callTool({ name: 'products_update', arguments: { product_id: 'p1' } })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/confirm must be true/);
    await close();
  });

  it('hides write tools in read-only mode and refuses to call them', async () => {
    const { client, close } = await connect({}, ['--read-only']);
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['feeds_list', 'docs_search']);
    const callsBefore = upstream.calls.length;
    const result = (await client.callTool({
      name: 'products_update',
      arguments: { product_id: 'p1', confirm: true }
    })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Unknown tool: products_update/);
    expect(upstream.calls.length).toBe(callsBefore);
    await close();
  });

  it('limits tools to the chosen groups', async () => {
    const { client, close } = await connect({ AI_SHOPPING_FEEDS_TOOLS: 'products' });
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['products_update', 'products_bulk_upsert']);
    await close();
  });

  it('explains a rejected API key on list and on call', async () => {
    const { client, close } = await connect({ AI_SHOPPING_FEEDS_API_KEY: 'asf_wrong' });
    await expect(client.listTools()).rejects.toThrow(/did not accept the API key/);
    const result = (await client.callTool({ name: 'feeds_list', arguments: {} })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/did not accept the API key/);
    await close();
  });

  it('explains an unreachable server', async () => {
    const { client, close } = await connect({ AI_SHOPPING_FEEDS_API_URL: 'http://127.0.0.1:9/api/v1/mcp' });
    const result = (await client.callTool({ name: 'feeds_list', arguments: {} })) as CallToolResult;
    expect(result.isError).toBe(true);
    expect(text(result)).toMatch(/Could not reach AI Shopping Feeds/);
    await close();
  });
});
