# Changelog

## 0.1.0

First release.

- Local stdio MCP server for AI Shopping Feeds that passes every tool through to the hosted API
  with your API key, so new tools appear without an update.
- Tool names with underscores, so clients and model APIs that reject dots accept them.
- `--read-only` and `--tools` to limit what an agent can do.
- Agent skill (`skills/ai-shopping-feeds/SKILL.md`) that sets the server up and explains how to
  use the tools.
