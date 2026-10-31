import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

  it('serves MCP over stdio end to end', async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [bin, '--read-only'],
      env: { PATH: process.env.PATH ?? '', AI_SHOPPING_FEEDS_API_KEY: VALID_KEY, AI_SHOPPING_FEEDS_API_URL: upstream.url.href },
      stderr: 'pipe'
    });
    const client = new Client({ name: 'cli-test', version: '0.0.0' });
    await client.connect(transport);
    expect(client.getServerVersion()?.name).toBe('ai-shopping-feeds');
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(['feeds_list', 'docs_search']);
    const result = await client.callTool({ name: 'docs_search', arguments: { query: 'merchant center' } });
    expect(JSON.stringify(result.content)).toContain('docs.search');
    await client.close();
  }, 30_000);
});
