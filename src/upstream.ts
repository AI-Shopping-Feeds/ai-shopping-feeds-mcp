import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport, StreamableHTTPError } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

import type { Config } from './config.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

/** An error worth showing to the person as it is. */
export class UpstreamError extends Error {}

export function describeUpstreamError(error: unknown): string {
  if (error instanceof StreamableHTTPError) {
    if (error.code === 401) {
      return 'AI Shopping Feeds did not accept the API key. It may have been revoked or mistyped: ' +
        'create a new one under Team → API Keys and update AI_SHOPPING_FEEDS_API_KEY.';
    }
    if (error.code === 403) {
      return 'AI Shopping Feeds refused the request for this API key (403). Check the key\'s scopes and brand access.';
    }
    if (error.code === 429) {
      return 'AI Shopping Feeds rate limit reached. Wait a minute and try again.';
    }
    if (error.code !== undefined && error.code >= 500) {
      return `AI Shopping Feeds is not responding properly (HTTP ${error.code}). Try again shortly.`;
    }
  }
  if (error instanceof UpstreamError) return error.message;
  const message = error instanceof Error ? error.message : String(error);
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(message)) {
    return `Could not reach AI Shopping Feeds: ${message}. Check your internet connection.`;
  }
  return message;
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
    const client = new Client({ name: PACKAGE_NAME, version: PACKAGE_VERSION }, { capabilities: {} });
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

  /** Runs a request, reconnecting once if the connection had dropped. */
  private async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      return await run(client);
    } catch (error) {
      if (error instanceof StreamableHTTPError && error.code === 404) {
        await this.reset();
        return run(await this.getClient());
      }
      throw error;
    }
  }

  async listTools(): Promise<Tool[]> {
    return this.withClient(async (client) => {
      const tools: Tool[] = [];
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : {}, { timeout: this.config.timeoutMs });
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      return tools;
    });
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    return this.withClient(async (client) => {
      const result = await client.callTool({ name, arguments: args ?? {} }, undefined, {
        timeout: this.config.timeoutMs,
        resetTimeoutOnProgress: true
      });
      return result as CallToolResult;
    });
  }

  async reset(): Promise<void> {
    const client = this.client;
    this.client = null;
    await client?.close().catch(() => {});
  }
}
