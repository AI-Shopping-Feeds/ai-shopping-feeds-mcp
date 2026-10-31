export const DEFAULT_API_URL = 'https://app.aishoppingfeeds.com/api/v1/mcp';
export const DEFAULT_TIMEOUT_MS = 120_000;

export interface Config {
  apiKey: string;
  apiUrl: URL;
  readOnly: boolean;
  /** Tool groups to expose, such as "feeds" or "products". Empty means all. */
  toolGroups: string[];
  timeoutMs: number;
}

export class ConfigError extends Error {}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);

function parseBoolean(value: string | undefined): boolean {
  return value !== undefined && TRUE_VALUES.has(value.trim().toLowerCase());
}

function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new ConfigError(`${flag} needs a value.`);
  }
  return value;
}

/**
 * Builds the configuration from environment variables, then command-line
 * flags. The API key is read from the environment only, so it never shows in
 * process lists or shell history.
 */
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv.slice(2)
): Config {
  let apiUrl = env.AI_SHOPPING_FEEDS_API_URL?.trim() || DEFAULT_API_URL;
  let readOnly = parseBoolean(env.AI_SHOPPING_FEEDS_READ_ONLY);
  let toolGroups = parseList(env.AI_SHOPPING_FEEDS_TOOLS);
  let timeoutSetting = env.AI_SHOPPING_FEEDS_TIMEOUT_MS?.trim();

  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inlineValue] = argv[i].split(/=(.*)/s, 2);
    const value = () => {
      if (inlineValue !== undefined) return inlineValue;
      const next = readFlagValue(argv, i, flag);
      i += 1;
      return next;
    };

    switch (flag) {
      case '--read-only':
        readOnly = true;
        break;
      case '--tools':
        toolGroups = parseList(value());
        break;
      case '--api-url':
        apiUrl = value();
        break;
      case '--timeout-ms':
        timeoutSetting = value();
        break;
      case '--api-key':
        throw new ConfigError(
          'Pass the API key in the AI_SHOPPING_FEEDS_API_KEY environment variable, not as a flag.'
        );
      default:
        throw new ConfigError(`Unknown option: ${argv[i]}. Run with --help to see the options.`);
    }
  }

  const apiKey = env.AI_SHOPPING_FEEDS_API_KEY?.trim();
  if (!apiKey) {
    throw new ConfigError(
      'AI_SHOPPING_FEEDS_API_KEY is not set. Create an API key in AI Shopping Feeds under ' +
        'Team → API Keys, then add it to the "env" block of your MCP client config.'
    );
  }

  let url: URL;
  try {
    url = new URL(apiUrl);
  } catch {
    throw new ConfigError(`AI_SHOPPING_FEEDS_API_URL is not a valid URL: ${apiUrl}`);
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new ConfigError('AI_SHOPPING_FEEDS_API_URL must use https (http is allowed for localhost only).');
  }

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  if (timeoutSetting) {
    timeoutMs = Number(timeoutSetting);
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
      throw new ConfigError('The timeout must be a whole number of milliseconds, 1000 or more.');
    }
  }

  return { apiKey, apiUrl: url, readOnly, toolGroups, timeoutMs };
}
