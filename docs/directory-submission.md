# Submitting to the Claude and ChatGPT directories

Both directories list the **hosted** server, `https://app.aishoppingfeeds.com/api/v1/mcp`, not the
local npm package. Neither accepts a local server as a connector. The `plugin/` folder bundles that
hosted server with a skill.

| Listing | Where | What you give it |
|---|---|---|
| Claude connector | [claude.ai/directory/manage](https://claude.ai/directory/manage) → **MCP connector** | The server URL |
| Claude plugin | Same portal → **Plugin bundle** | This repository, plugin path `plugin` |
| ChatGPT plugin | [platform.openai.com/plugins](https://platform.openai.com/plugins) → **Create plugin** → **With MCP** | The ZIP from `npm run plugin:zip`, and the server URL |

Claude's guidance is to submit the connector as well as the plugin. Approvals don't transfer
between the two companies.

## Before you submit

The hosted server needed changes for both directories. They are in `ai-shopping-feeds-backend`
([#457](https://github.com/pavegrowth/ai-shopping-feeds-backend/pull/457)), and must be deployed before you submit:

| Change | Needed by |
|---|---|
| A `title` on every tool | Claude (flagged in the portal), OpenAI |
| Explicit `readOnlyHint`, `destructiveHint` and `openWorldHint` on every tool | OpenAI (all three), Claude (the first two) |
| A UserInfo endpoint returning `email` and `email_verified`, with `openid` and `email` scopes advertised | OpenAI |
| The portal's token served as plain text at `/.well-known/openai-apps-challenge`, from `OPENAI_APPS_CHALLENGE_TOKEN` | OpenAI |
| `account.plans` and `account.billing_link` hidden from OAuth connections | OpenAI (no plans, upgrades or checkout links) |
| `creatives.remove_background` hidden from OAuth connections, and `creatives.publish` refusing designs that use it | Claude (no AI image generation) |

After deploying, an OAuth connection lists 100 tools rather than 103.

## What only you can do

- **OpenAI:** complete business verification, and have **Apps Management Write** on the organization.
- **Claude:** submit from a paid plan, and connect GitHub to claude.ai in that organization.
- **Reviewer access:** sign-in has no passwords, only an emailed code or Google, so a test login
  isn't simple to hand over. The Claude connector gives reviewers self-registration steps instead,
  in the portal's **Test & launch** step. A reviewer may still ask for a populated account.
  ChatGPT's review form asks for credentials, so settle this before submitting there.
- **Run every tool yourself** through MCP Inspector or as a custom connector. Claude's portal asks
  you to confirm this.
- **Record a demo video** at a link reviewers can open (`review.demo_recording_url`).
- **Accept the policy attestations** in each portal.

## Listing copy

- **Name:** AI Shopping Feeds
- **Short description (30):** Manage shopping product feeds
- **One-liner (200):** Import, audit, fix and optimise ecommerce product feeds, then publish them to
  Google Merchant Center and Meta, from your conversation.
- **Description:** see `longDescription` in `plugin/plugin.json`.
- **Website:** https://aishoppingfeeds.com
- **Documentation:** https://github.com/AI-Shopping-Feeds/ai-shopping-feeds-mcp#readme
- **Privacy policy:** https://aishoppingfeeds.com/privacy
- **Terms:** https://aishoppingfeeds.com/terms
- **Support:** https://aishoppingfeeds.com/contact
- **Icon:** `plugin/assets/logo.png`
- **Claude step 4, reads or writes:** both. Users need an AI Shopping Feeds account, and must be a
  workspace owner or admin to connect.
- **Claude step 6, authentication:** always required, OAuth with dynamic client registration.
- **Claude step 7, data handling:** the underlying API is our own. No personal health data or
  sponsored content.
- **OpenAI `review.commerce`:** false. The plugin doesn't sell anything.

## OpenAI test cases

### Positive (five required)

| Prompt | What it does | Tools | Expected behaviour |
|---|---|---|---|
| List my brands and feeds. | Reads the workspace. | `brands.list`, `feeds.list` | Lists the sample brands and feeds with their ids. Changes nothing. |
| Which products in my main feed are missing a GTIN? | Finds products with a data gap. | `feeds.list`, `products.list` | Names the products with no GTIN. Changes nothing. |
| Show the latest audit for my main feed. | Reads audit results. | `feeds.list`, `feeds.get_audit` | Summarises the audit's issues by severity. Changes nothing. |
| Preview a rule that adds the brand to the start of every title. | Previews without saving. | `rules.metadata`, `rules.preview` | Shows before and after titles for sample products. Nothing is saved. |
| Create that rule on my main feed. | Saves a rule after confirmation. | `rules.create` | Shows the rule and asks first, then creates it and reports its id. |

### Negative (three required)

| Prompt | Why no tool should run |
|---|---|
| What is the capital of France? | Unrelated to product feeds. |
| Write me a poem about shoes. | General writing that needs no account data. |
| Book me a flight to Paris. | Outside what the plugin does. |

## Releasing updates

- **Claude plugin:** merge to the tracked branch, raising `version` in both manifests.
- **ChatGPT plugin:** run `npm run plugin:zip` and upload the new ZIP, which goes through review again.
- **Tools on the hosted server:** OpenAI rescans daily. Changed tools can be held, and new ones stay
  unavailable until approved.
