# AI Shopping Feeds MCP Server

The official [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server for
[AI Shopping Feeds](https://aishoppingfeeds.com). It lets Claude, ChatGPT, Cursor and other AI
agents work with your product feeds: import and refresh feeds, edit products, write rules, run
AI optimisation and audits, connect Google Merchant Center and Meta, set performance labels and
make product ad creatives.

This package is a small, open-source client. It runs on your computer, speaks MCP over stdio to
your agent, and passes each request to the AI Shopping Feeds API with your API key. It holds no
data of its own and needs no setup beyond the key.

## Two ways to connect

| | Hosted connector | This package |
| --- | --- | --- |
| Install | Nothing | Node.js 20 or later |
| Sign-in | OAuth in the browser, or an API key | An API key |
| Works with | Claude, ChatGPT, Claude Code, Cursor, VS Code, Codex, Gemini CLI | Any client that runs local (stdio) MCP servers |
| Extras | | Read-only mode, tool groups, names every client accepts |

If your client supports remote connectors and you're happy to sign in through the browser, the
hosted connector at `https://app.aishoppingfeeds.com/api/v1/mcp` is the quickest route. Use this
package when your client only runs local servers, when you'd rather use an API key from an
environment variable, or when you want to limit what the agent can do.

## Let your agent set it up

Paste this into Claude Code, Codex, Cursor or any agent that can read web pages and edit files:

```text
Set up the AI Shopping Feeds MCP server for me by following
https://raw.githubusercontent.com/AI-Shopping-Feeds/ai-shopping-feeds-mcp/main/skills/ai-shopping-feeds/SKILL.md
```

The agent checks whether it's already connected, picks sign-in or an API key for your client,
helps you get a key (or creates your account through an emailed code), adds the server to your
config without touching your other servers, and checks it works.

The same file is an [Agent Skill](https://agentskills.io), so your agent can keep it as a guide
to using the tools well. For Claude Code, copy the folder into your skills:

```bash
git clone --depth 1 https://github.com/AI-Shopping-Feeds/ai-shopping-feeds-mcp.git /tmp/asf-mcp
cp -r /tmp/asf-mcp/skills/ai-shopping-feeds ~/.claude/skills/
```

Other agents that support skills load the same `skills/ai-shopping-feeds` folder from their own
skills directory.

## Tools

All the tools the hosted server offers are available here: 103 tools in 13 groups, covering
feeds, products, rules, AI optimisation, listing quality, Google product categories, exports,
channels, performance labels, creatives, brands, account and help docs. See
[docs/tools.md](docs/tools.md) for the full list.

The tool list comes from the AI Shopping Feeds API each time your agent asks for it, so new tools
appear without updating this package. Your agent only sees the tools your API key's scopes allow.

## Before you start

1. The server gives your agent access to the data the API key can reach. Treat the key like a
   password and give it only the scopes you need.
1. Tools that change data need `confirm: true`. Your agent should ask you before it sets it. If
   you want an agent that can only look, start the server with `--read-only`.
1. AI tools, such as `ai_optimize_product`, use your workspace's AI credits, as they do in the
   app. Background removal for creatives is free for a feed's first 50 photos, then uses credits.

## Setup

### 1. Get an API key

1. Sign in to [AI Shopping Feeds](https://app.aishoppingfeeds.com). Only workspace owners and
   admins can create keys.
1. Go to **Team → API Keys** and click **Create API key**.
1. Choose the scopes you need (start with the read scopes and add write scopes later), and
   optionally limit the key to some brands.
1. Copy the key. It is shown once.

### 2. Add the server to your client

Each example runs the latest published version with `npx`. Replace `YOUR_API_KEY` with your key.

#### Claude Desktop

Open **Settings → Developer → Edit Config** and add this to `claude_desktop_config.json`, then
restart Claude Desktop:

```json
{
  "mcpServers": {
    "ai-shopping-feeds": {
      "command": "npx",
      "args": ["-y", "@ai-shopping-feeds/mcp"],
      "env": {
        "AI_SHOPPING_FEEDS_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

The file lives at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS and
`%APPDATA%\Claude\claude_desktop_config.json` on Windows.

#### Claude Code

```bash
claude mcp add --scope user ai-shopping-feeds \
  --env AI_SHOPPING_FEEDS_API_KEY=YOUR_API_KEY \
  -- npx -y @ai-shopping-feeds/mcp
```

`--scope user` makes the server available in every project. Run `/mcp` inside Claude Code to
check it is connected.

#### Cursor

Add this to `~/.cursor/mcp.json` (create the file if it doesn't exist). Use the global file in
your home folder rather than a project's `.cursor/mcp.json`, so the key never ends up in a
repository.

```json
{
  "mcpServers": {
    "ai-shopping-feeds": {
      "command": "npx",
      "args": ["-y", "@ai-shopping-feeds/mcp"],
      "env": {
        "AI_SHOPPING_FEEDS_API_KEY": "YOUR_API_KEY"
      }
    }
  }
}
```

#### ChatGPT

ChatGPT connects to remote MCP servers only, so it uses the hosted connector rather than this
package:

1. In ChatGPT, open **Settings → Apps & Connectors**. Custom connectors need developer mode,
   under **Advanced settings**.
1. Create a connector, name it AI Shopping Feeds, enter
   `https://app.aishoppingfeeds.com/api/v1/mcp` as the server URL and choose OAuth.
1. Sign in to AI Shopping Feeds when asked, choose your workspace and click **Allow**. Then add
   the connector to a chat.

Custom connectors depend on your ChatGPT plan and workspace settings. For Codex, OpenAI's coding
agent, you can use this package instead:

```toml
# ~/.codex/config.toml
[mcp_servers.ai-shopping-feeds]
command = "npx"
args = ["-y", "@ai-shopping-feeds/mcp"]
env = { AI_SHOPPING_FEEDS_API_KEY = "YOUR_API_KEY" }
```

#### Other clients

Any client that can start a local MCP server works the same way: run
`npx -y @ai-shopping-feeds/mcp` with `AI_SHOPPING_FEEDS_API_KEY` set in its environment.

### 3. Try it

Ask your agent something like:

- "List my feeds and tell me which has the most products."
- "Run an audit on my main feed and summarise the worst problems."
- "Show me products missing a GTIN in the UK feed."
- "Write a rule that adds the brand name to the start of every title, and preview it first."

## Configuration

Set these in the `env` block of your client config. Command-line options, added after the
package name in `args`, override the environment.

| Environment variable | Option | Default | What it does |
| --- | --- | --- | --- |
| `AI_SHOPPING_FEEDS_API_KEY` | | (required) | Your API key. It is read from the environment only, never from a flag. |
| `AI_SHOPPING_FEEDS_READ_ONLY` | `--read-only` | `false` | Expose only tools that read data. |
| `AI_SHOPPING_FEEDS_TOOLS` | `--tools` | all | Comma-separated tool groups to expose, such as `feeds,products,rules`. Groups are listed in [docs/tools.md](docs/tools.md). |
| `AI_SHOPPING_FEEDS_TIMEOUT_MS` | `--timeout-ms` | `120000` | How long to wait for each request, in milliseconds. |
| `AI_SHOPPING_FEEDS_API_URL` | `--api-url` | `https://app.aishoppingfeeds.com/api/v1/mcp` | The MCP endpoint. You shouldn't need to change this. |

For example, a read-only server limited to feeds and products:

```json
"args": ["-y", "@ai-shopping-feeds/mcp", "--read-only", "--tools", "feeds,products"]
```

### Tool names

The hosted server names its tools with dots, such as `feeds.list`, which is also how the REST API
docs refer to them. Some clients and model APIs only accept letters, digits, `_` and `-` in tool
names, so this package shows them with underscores (`feeds_list`) and translates them back.

## Troubleshooting

- **"AI_SHOPPING_FEEDS_API_KEY is not set"**: add the key to the `env` block of your client config,
  not to `args`, and restart the client.
- **"did not accept the API key"**: the key was revoked, has expired or was mistyped. Create a new
  one under **Team → API Keys**.
- **A tool is missing**: the key doesn't have the scope for it, or `--read-only` or `--tools` is
  hiding it. Check the key's scopes in the app.
- **"Could not reach AI Shopping Feeds"**: check your internet connection. If you're behind a
  proxy, Node.js 24 and later use the `HTTPS_PROXY` variable when `NODE_USE_ENV_PROXY=1` is set.
- **`npx` not found**: install Node.js 20 or later from [nodejs.org](https://nodejs.org). Claude
  Desktop and Cursor may need the full path to `npx` in `command` if Node.js is installed through a
  version manager.
- Your client's MCP logs show this server's messages. In Claude Desktop they are in the
  `mcp-server-ai-shopping-feeds.log` file under **Settings → Developer → Open Logs Folder**.

## Run from source

```bash
git clone https://github.com/AI-Shopping-Feeds/ai-shopping-feeds-mcp.git
cd ai-shopping-feeds-mcp
npm install
npm run build
AI_SHOPPING_FEEDS_API_KEY=YOUR_API_KEY node dist/index.js --help
```

Point your client at `node /path/to/ai-shopping-feeds-mcp/dist/index.js` instead of `npx`.

```bash
npm test            # unit and end-to-end tests against a local stand-in server
npm run typecheck
```

## Security

The API key stays on your computer and is sent only to the AI Shopping Feeds API over HTTPS. The
server refuses plain HTTP except to `localhost`. See [SECURITY.md](SECURITY.md) to report a
vulnerability.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). New tools are added
to the AI Shopping Feeds API rather than to this package, so they reach every client at once.

## Licence

[Apache License 2.0](LICENSE). "AI Shopping Feeds" is a trademark of its owner; the licence does
not grant rights to use it.
