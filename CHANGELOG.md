# Changelog

## 0.2.0

- Moved from `@modelcontextprotocol/sdk` 1.x, which only gets fixes until early 2027, to the
  v2 packages (`@modelcontextprotocol/server` and `@modelcontextprotocol/client` 2.4).
- Serves MCP clients that speak the 2026-07-28 protocol revision as well as 2025-era ones.
- Connects to the hosted server with whichever protocol revision it speaks: it asks for
  2026-07-28 first and falls back to the 2025 handshake.
- Passes progress from long-running tools on to your client, when the client asks for it.
- Cancelling a tool call in your client, or closing the client, now cancels the call on the
  hosted server too.
- Anything a dependency logs now goes to stderr, so it can't corrupt the MCP stream on stdout.

## 0.1.0

First release.

- Local stdio MCP server for AI Shopping Feeds that passes every tool through to the hosted API
  with your API key, so new tools appear without an update.
- Tool names with underscores, so clients and model APIs that reject dots accept them.
- `--read-only` and `--tools` to limit what an agent can do.
- Agent skill (`skills/ai-shopping-feeds/SKILL.md`) that sets the server up and explains how to
  use the tools.
