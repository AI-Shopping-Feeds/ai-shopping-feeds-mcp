# Security

## Reporting a vulnerability

Please report security issues privately through GitHub: open the repository's **Security** tab
and choose **Report a vulnerability**. Don't open a public issue.

Include what you found, how to reproduce it and what an attacker could do with it. We'll reply
within five working days.

This covers the code in this repository. Issues in the AI Shopping Feeds service itself (the API,
the hosted MCP server or the web app) can be reported the same way.

## How this package handles your key

- The API key is read from the `AI_SHOPPING_FEEDS_API_KEY` environment variable only, never from
  a command-line flag, so it stays out of process lists and shell history.
- It is sent only to the configured MCP endpoint, over HTTPS. Plain HTTP is refused except to
  `localhost`.
- The package stores nothing on disk and sends no telemetry.
