import { Client, SdkHttpError, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import type { CallToolResult, Tool } from '@modelcontextprotocol/client';

import type { Config } from './config.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

/** An error worth showing to the person as it is. */
export class UpstreamError extends Error {}

export function describeUpstreamError(error: unknown): string {
  if (error instanceof SdkHttpError) {
    if (error.status === 401) {
      return 'AI Shopping Feeds did not accept the API key. It may have been revoked or mistyped: ' +
        'create a new one under Team → API Keys and update AI_SHOPPING_FEEDS_API_KEY.';
    }
    if (error.status === 403) {
      return 'AI Shopping Feeds refused the request for this API key (403). Check the key\'s scopes and brand access.';
    }
    if (error.status === 429) {
      return 'AI Shopping Feeds rate limit reached. Wait a minute and try again.';
    }
    if (error.status !== undefined && error.status >= 500) {
      return `AI Shopping Feeds is not responding properly (HTTP ${error.status}). Try again shortly.`;
    }
  }
  if (error instanceof UpstreamError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return `Could not reach AI Shopping Feeds: ${message}. Check your internet connection.`;
  }
  return message;
}

export interface ListToolsOptions {
  /** Skip a cached tool list the hosted server said was still fresh. */
  refresh?: boolean;
}

/**
 * A connection to the hosted AI Shopping Feeds MCP server. It connects on
 * first use and reconnects after a failure, so the local server can start
 * before the network is up.
 */
export class Upstream {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  constructor(
    private readonly config: Config,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async connect(): Promise<Client> {
    const transport = new StreamableHTTPClientTransport(this.config.apiUrl, {
      fetch: this.fetchImpl,
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'User-Agent': `${PACKAGE_NAME}/${PACKAGE_VERSION}`
        }
      }
    });
    // 'auto' asks the server for its protocol versions first (server/discover)
    // and uses 2026-07-28 when it offers it. A 2025-era server does not
    // recognise that request, so the client falls back to the 2025
    // initialize handshake on the same endpoint.
    const client = new Client(
      { name: PACKAGE_NAME, version: PACKAGE_VERSION },
      { capabilities: {}, versionNegotiation: { mode: 'auto' } }
    );
    client.onclose = () => {
      if (this.client === client) this.client = null;
    };
    await client.connect(transport, { timeout: this.config.timeoutMs });
    return client;
  }

  async getClient(): Promise<Client> {
    if (this.client) return this.client;
    if (!this.connecting) {
      this.connecting = this.connect()
        .then((client) => {
          this.client = client;
          return client;
        })
        .finally(() => {
          this.connecting = null;
        });
    }
    return this.connecting;
  }

  /** Runs a request, reconnecting once if the server no longer knows the session. */
  private async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      return await run(client);
    } catch (error) {
      if (error instanceof SdkHttpError && error.status === 404) {
        await this.reset();
        return run(await this.getClient());
      }
      throw error;
    }
  }

  /** Every tool the hosted server offers. The client follows nextCursor across pages. */
  async listTools(options: ListToolsOptions = {}): Promise<Tool[]> {
    return this.withClient(async (client) => {
      const { tools } = await client.listTools(undefined, {
        timeout: this.config.timeoutMs,
        cacheMode: options.refresh ? 'refresh' : 'use'
      });
      return tools;
    });
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    return this.withClient((client) =>
      client.callTool({ name, arguments: args ?? {} }, { timeout: this.config.timeoutMs, resetTimeoutOnProgress: true })
    );
  }

  async reset(): Promise<void> {
    const client = this.client;
    this.client = null;
    await client?.close().catch(() => {});
  }
}
