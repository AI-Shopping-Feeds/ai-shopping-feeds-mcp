# AI Shopping Feeds

Manage ecommerce product feeds in [AI Shopping Feeds](https://aishoppingfeeds.com) from your agent:
import a store or feed, audit and fix products, write rules, improve titles and descriptions with
AI, classify products, and publish to Google Merchant Center and Meta catalogues.

## What this plugin contains

- A connection to the hosted AI Shopping Feeds MCP server,
  `https://app.aishoppingfeeds.com/api/v1/mcp`.
- One skill, `ai-shopping-feeds`, that explains how to use its tools well.

It runs nothing on your computer, installs no packages, and has no hooks or scripts.

## What it sends, and where

Your agent sends the tool requests you ask for, including any product data in them, to
`app.aishoppingfeeds.com` over HTTPS. It sends data nowhere else. If you link a channel, AI
Shopping Feeds publishes your products to the Google or Meta account you linked. See the
[privacy policy](https://aishoppingfeeds.com/privacy) and [terms](https://aishoppingfeeds.com/terms).

## Connect

You need an AI Shopping Feeds account. When your agent first uses the server, your browser opens
to sign in with OAuth. You choose the workspace, and optionally which brands to share. Only
workspace owners and admins can connect an app, and they can disconnect it in the app under
**Team → API keys → Connected apps**.

## Support

[Contact us](https://aishoppingfeeds.com/contact), or open an issue on
[GitHub](https://github.com/AI-Shopping-Feeds/ai-shopping-feeds-mcp/issues).

## Licence

[Apache License 2.0](LICENSE).
