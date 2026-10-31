import { describe, expect, it } from 'vitest';

import { ConfigError, DEFAULT_API_URL, DEFAULT_TIMEOUT_MS, loadConfig } from '../src/config.js';

const KEY = { AI_SHOPPING_FEEDS_API_KEY: 'asf_live_example' };

describe('loadConfig', () => {
  it('uses the hosted endpoint and safe defaults', () => {
    const config = loadConfig(KEY, []);
    expect(config.apiKey).toBe('asf_live_example');
    expect(config.apiUrl.href).toBe(DEFAULT_API_URL);
    expect(config.readOnly).toBe(false);
    expect(config.toolGroups).toEqual([]);
    expect(config.timeoutMs).toBe(DEFAULT_TIMEOUT_MS);
  });

  it('explains how to get a key when none is set', () => {
    expect(() => loadConfig({}, [])).toThrow(ConfigError);
    expect(() => loadConfig({ AI_SHOPPING_FEEDS_API_KEY: '  ' }, [])).toThrow(/Team → API Keys/);
  });

  it('refuses the key as a flag so it stays out of process lists', () => {
    expect(() => loadConfig(KEY, ['--api-key', 'asf_live_example'])).toThrow(/environment variable/);
  });

  it('reads options from the environment', () => {
    const config = loadConfig(
      { ...KEY, AI_SHOPPING_FEEDS_READ_ONLY: 'TRUE', AI_SHOPPING_FEEDS_TOOLS: 'Feeds, products,,', AI_SHOPPING_FEEDS_TIMEOUT_MS: '30000' },
      []
    );
    expect(config.readOnly).toBe(true);
    expect(config.toolGroups).toEqual(['feeds', 'products']);
    expect(config.timeoutMs).toBe(30_000);
  });

  it('lets flags override the environment, with or without "="', () => {
    const config = loadConfig({ ...KEY, AI_SHOPPING_FEEDS_TOOLS: 'rules' }, [
      '--read-only',
      '--tools=feeds,docs',
      '--timeout-ms',
      '5000'
    ]);
    expect(config.readOnly).toBe(true);
    expect(config.toolGroups).toEqual(['feeds', 'docs']);
    expect(config.timeoutMs).toBe(5_000);
  });

  it('rejects unknown options and missing values', () => {
    expect(() => loadConfig(KEY, ['--nope'])).toThrow(/Unknown option/);
    expect(() => loadConfig(KEY, ['--tools'])).toThrow(/needs a value/);
  });

  it('only allows plain http for localhost', () => {
    expect(loadConfig({ ...KEY, AI_SHOPPING_FEEDS_API_URL: 'http://localhost:5001/api/v1/mcp' }, []).apiUrl.port).toBe('5001');
    expect(() => loadConfig({ ...KEY, AI_SHOPPING_FEEDS_API_URL: 'http://example.com/mcp' }, [])).toThrow(/https/);
    expect(() => loadConfig({ ...KEY, AI_SHOPPING_FEEDS_API_URL: 'not a url' }, [])).toThrow(/valid URL/);
  });

  it('rejects silly timeouts', () => {
    expect(() => loadConfig({ ...KEY, AI_SHOPPING_FEEDS_TIMEOUT_MS: '10' }, [])).toThrow(/timeout/);
    expect(() => loadConfig(KEY, ['--timeout-ms', 'soon'])).toThrow(/timeout/);
  });
});
