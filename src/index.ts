#!/usr/bin/env node
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { ConfigError, DEFAULT_API_URL, loadConfig } from './config.js';
import { createServer } from './server.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

const HELP = `${PACKAGE_NAME} ${PACKAGE_VERSION}
MCP server for AI Shopping Feeds. Speaks MCP over stdio; start it from your MCP client.

Environment:
  AI_SHOPPING_FEEDS_API_KEY     Your API key (required). Create one under Team → API Keys.
  AI_SHOPPING_FEEDS_READ_ONLY   "true" to expose read-only tools only.
  AI_SHOPPING_FEEDS_TOOLS       Comma-separated tool groups to expose, e.g. "feeds,products,rules".
  AI_SHOPPING_FEEDS_TIMEOUT_MS  Per-request timeout in milliseconds (default 120000).
  AI_SHOPPING_FEEDS_API_URL     MCP endpoint (default ${DEFAULT_API_URL}).

Options (override the environment):
  --read-only        Expose read-only tools only.
  --tools <groups>   Comma-separated tool groups to expose.
  --timeout-ms <ms>  Per-request timeout.
  --api-url <url>    MCP endpoint.
  --help, --version
`;

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(HELP);
    return;
  }
  if (argv.includes('--version') || argv.includes('-v')) {
    process.stdout.write(`${PACKAGE_VERSION}\n`);
    return;
  }

  const config = loadConfig(process.env, argv);
  // stdout carries the protocol. Send any console output from dependencies
  // (in Node, console.log, info and debug write to stdout) to stderr instead.
  console.log = console.info = console.debug = console.error;
  // serveStdio answers both 2025-era clients (initialize) and 2026-07-28
  // clients (server/discover) from the same factory.
  const handle = serveStdio(() => createServer(config), {
    onerror: (error) => console.error(`${PACKAGE_NAME}: ${error.message}`)
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void handle.close().finally(() => process.exit(0));
    });
  }
  // stdout carries the protocol, so status goes to stderr.
  console.error(`${PACKAGE_NAME} ${PACKAGE_VERSION} ready (${config.apiUrl.host}${config.readOnly ? ', read-only' : ''})`);
}

main().catch((error: unknown) => {
  const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
  console.error(`${PACKAGE_NAME}: ${message}`);
  process.exit(1);
});
