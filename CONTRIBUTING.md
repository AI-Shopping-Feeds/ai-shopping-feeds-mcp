# Contributing

Thanks for helping. Issues and pull requests are welcome.

## What belongs here

This package is a thin client: it lists and calls the tools the hosted AI Shopping Feeds MCP
server offers. New tools, and changes to what a tool does, are made in the AI Shopping Feeds API,
so please open an issue rather than adding tool logic here. Fixes and improvements to the client
itself, the docs and the agent skill are very welcome.

## Development

You need Node.js 20 or later.

```bash
npm install
npm run typecheck
npm test
npm run build
```

The tests run against a local stand-in for the hosted server (`test/fakeUpstream.ts`), so they
need no API key or network access.

To refresh [docs/tools.md](docs/tools.md) from the live server, use a key with every scope:

```bash
AI_SHOPPING_FEEDS_API_KEY=YOUR_API_KEY npm run tools:update
```

## Pull requests

- Keep changes focused, and add or update tests for behaviour changes.
- Write docs in UK English and plain language.
- Add a line to [CHANGELOG.md](CHANGELOG.md) under a new "Unreleased" heading.

By contributing you agree that your contributions are licensed under the
[Apache License 2.0](LICENSE).
