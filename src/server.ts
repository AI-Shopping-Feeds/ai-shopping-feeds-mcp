import { Server } from '@modelcontextprotocol/server';
import type { CallToolResult, Tool } from '@modelcontextprotocol/server';

import type { Config } from './config.js';
import { describeUpstreamError, Upstream } from './upstream.js';
import { PACKAGE_VERSION } from './version.js';

export const SERVER_INSTRUCTIONS = [
  'Tools for AI Shopping Feeds: product feeds, products, rules, AI optimisation, audits, exports,',
  'shopping channels, performance labels and product ad creatives for one workspace.',
  'Start with brands_list or feeds_list to find ids. Tools that change data need confirm: true;',
  'ask the person before you set it. docs_search and docs_get explain how the app works.'
].join(' ');

/**
 * Hosted tool names are dotted ("feeds.list"). Some clients and model APIs
 * only accept letters, digits, "_" and "-", so the local names use "_".
 */
export function toLocalName(upstreamName: string): string {
  return upstreamName.replace(/[^A-Za-z0-9_-]/g, '_');
}

export function toolGroup(upstreamName: string): string {
  return upstreamName.split(/[._]/, 1)[0].toLowerCase();
}

export function isExposed(tool: Tool, config: Pick<Config, 'readOnly' | 'toolGroups'>): boolean {
  if (config.readOnly && tool.annotations?.readOnlyHint !== true) return false;
  if (config.toolGroups.length > 0 && !config.toolGroups.includes(toolGroup(tool.name))) return false;
  return true;
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function createServer(config: Config, upstream: Upstream = new Upstream(config)): Server {
  const server = new Server(
    { name: 'ai-shopping-feeds', version: PACKAGE_VERSION },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS }
  );

  // Local name -> hosted name, for the tools this server exposes.
  let exposed = new Map<string, string>();

  async function refreshTools(refresh = false): Promise<Tool[]> {
    const tools = (await upstream.listTools({ refresh })).filter((tool) => isExposed(tool, config));
    exposed = new Map(tools.map((tool) => [toLocalName(tool.name), tool.name]));
    return tools.map((tool) => ({ ...tool, name: toLocalName(tool.name) }));
  }

  server.setRequestHandler('tools/list', async () => {
    try {
      return { tools: await refreshTools() };
    } catch (error) {
      // Thrown errors reach the client as they are, so only throw the sanitised message.
      throw new Error(describeUpstreamError(error));
    }
  });

  server.setRequestHandler('tools/call', async (request) => {
    const localName = request.params.name;
    try {
      if (!exposed.has(localName)) await refreshTools(true);
      const upstreamName = exposed.get(localName);
      if (!upstreamName) {
        const reason = config.readOnly || config.toolGroups.length > 0
          ? ' It may be hidden by --read-only or --tools, or need a scope this API key does not have.'
          : ' It may need a scope this API key does not have.';
        return errorResult(`Unknown tool: ${localName}.${reason}`);
      }
      return await upstream.callTool(upstreamName, request.params.arguments);
    } catch (error) {
      return errorResult(describeUpstreamError(error));
    }
  });

  server.onclose = () => {
    void upstream.reset();
  };

  return server;
}
