import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/client';
import type { Progress } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

import { startFakeUpstream, VALID_KEY, type FakeUpstream } from './fakeUpstream.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = fileURLToPath(new URL('../dist/index.js', import.meta.url));
let upstream: FakeUpstream;

beforeAll(async () => {
  execFileSync('npx', ['tsc', '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' });
  upstream = await startFakeUpstream();
}, 60_000);

afterAll(async () => {
  await upstream?.close();
});

function env(): Record<string, string> {
  return { PATH: process.env.PATH ?? '', AI_SHOPPING_FEEDS_API_KEY: VALID_KEY, AI_SHOPPING_FEEDS_API_URL: upstream.url.href };
}

function run(args: string[], env: Record<string, string> = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH ?? '', ...env },
    input: ''
  });
}

describe('command line', () => {
  it('prints help and version', () => {
    expect(run(['--help']).stdout).toMatch(/AI_SHOPPING_FEEDS_API_KEY/);
    expect(run(['--version']).stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('exits with a clear message when the key is missing', () => {
    const result = run([]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/AI_SHOPPING_FEEDS_API_KEY is not set/);
    expect(result.stdout).toBe('');
  });

  it.each([
    ['2025-era', {}],
    ['2026-07-28', { versionNegotiation: { mode: 'auto' as const } }]
  ])('serves MCP over stdio end to end to a %s client, relaying progress', async (_era, options) => {
    const transport = new StdioClientTransport({ command: process.execPath, args: [bin, '--read-only'], env: env(), stderr: 'pipe' });
    const client = new Client({ name: 'cli-test', version: '0.0.0' }, options);
    await client.connect(transport);
    expect(client.getServerVersion()?.name).toBe('ai-shopping-feeds');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['feeds_list', 'docs_search', 'exports_run']);
    const result = await client.callTool({ name: 'docs_search', arguments: { query: 'merchant center' } });
    expect(JSON.stringify(result.content)).toContain('docs.search');
    await client.close();

    // feeds_refresh is a write tool, so it needs a server without --read-only.
    const writer = new Client({ name: 'cli-test', version: '0.0.0' }, options);
    await writer.connect(new StdioClientTransport({ command: process.execPath, args: [bin], env: env(), stderr: 'pipe' }));
    const updates: Progress[] = [];
    await writer.callTool({ name: 'feeds_refresh', arguments: {} }, { onprogress: (update) => updates.push(update) });
    expect(updates.map((update) => update.progress)).toEqual([1, 2, 3]);
    await writer.close();
  }, 30_000);

  it('writes nothing but JSON-RPC to stdout, and logs to stderr', async () => {
    const { lines, stderr } = await rawSession(upstream.url, [
      ['tools/list', {}],
      ['tools/call', { name: 'feeds_refresh', arguments: {}, _meta: { progressToken: 'p' } }]
    ]);
    expect(lines.length).toBe(6); // three responses and three progress notifications
    for (const line of lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' });
    expect(lines.filter((line) => line.includes('notifications/progress'))).toHaveLength(3);
    expect(lines.findIndex((line) => line.includes('"id":3'))).toBe(5); // the result comes after its progress
    expect(stderr).toMatch(/ready \(127\.0\.0\.1:\d+\)/);
  }, 30_000);

  it('keeps stdout clean when the SDK logs, such as for a server without the tools capability', async () => {
    const bare = await startFakeUpstream({ toolsCapability: false });
    try {
      const { lines, responses } = await rawSession(bare.url, [['tools/list', {}]]);
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: '2.0' });
      expect(responses.get(2)).toMatchObject({ result: { tools: [] } });
    } finally {
      await bare.close();
    }
  }, 30_000);
});

/**
 * Talks to dist/index.js over raw stdio: initialize, then each request in
 * turn (ids from 2), then closes stdin and waits for the process to exit.
 * Every stdout line must parse as JSON.
 */
async function rawSession(url: URL, requests: [string, object][]) {
  const child = spawn(process.execPath, [bin], {
    env: { ...env(), AI_SHOPPING_FEEDS_API_URL: url.href },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const lines: string[] = [];
  const responses = new Map<number, unknown>();
  const waiting = new Map<number, () => void>();
  createInterface({ input: child.stdout }).on('line', (line) => {
    lines.push(line);
    const message = JSON.parse(line) as { id?: number };
    if (typeof message.id === 'number') {
      responses.set(message.id, message);
      waiting.get(message.id)?.();
    }
  });
  const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (id: number, method: string, params: object) =>
    new Promise<void>((resolve) => {
      waiting.set(id, resolve);
      send({ jsonrpc: '2.0', id, method, params });
    });

  await request(1, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'raw', version: '0.0.0' }
  });
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });
  for (const [index, [method, params]] of requests.entries()) await request(index + 2, method, params);
  child.stdin.end();
  await new Promise((resolve) => child.on('exit', resolve));
  return { lines, responses, stderr };
}
