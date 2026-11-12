# Submitting to the Claude and OpenAI directories

The connector listings use the **hosted** server, `https://app.aishoppingfeeds.com/api/v1/mcp`, not the
local npm package. Neither accepts a local server as a connector. The `plugin/` folder bundles that
hosted server with a skill.

| Listing | Where | What you give it |
|---|---|---|
| Claude connector | [claude.ai/directory/manage](https://claude.ai/directory/manage) → **MCP connector** | The server URL |
| Claude plugin | Same portal → **Plugin bundle** | This repository, plugin path `plugin` |
| OpenAI plugin (ChatGPT and Codex) | [platform.openai.com/plugins](https://platform.openai.com/plugins), after preparation below | The ZIP from `npm run plugin:zip`, and the server URL |

The publisher confirmed on 2026-11-12 that Anthropic approved the connector. OpenAI review
is separate. ChatGPT and Codex share OpenAI's public plugin directory, so this portable package
uses one OpenAI submission rather than a separate Codex listing. See the
[OpenAI submission guide](https://developers.openai.com/plugins/deploy/submission).

The OpenAI preparation changes are saved locally; no OpenAI upload, review submission or
publication has been verified in this chat.

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
  For OpenAI, invite `mcp-review@theaicompany.org` to a dedicated demo workspace so reviewers can receive their own email codes. They must not need to register or access your inbox. Put login instructions only in the secure reviewer-access fields, never the ZIP.
- **Run every tool yourself** through MCP Inspector or as a custom connector. Claude's portal asks
  you to confirm this.
- **Record a demo video** at a link reviewers can open (`review.demo_recording_url`).
- **Accept the policy attestations** in each portal.

## Listing copy

- **Name:** AI Shopping Feeds
- **Short description (29):** Manage shopping product feeds
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

## OpenAI preparation status (checked 2026-11-12)

The canonical cases are in `plugin/plugin.json` under
`extensions.com.openai.review.test_cases`: five positive cases cover brand/feed discovery,
missing GTINs, saved audits, unsaved rule previews, and taxonomy search. Three negative cases
cover purchasing stock, creating ad campaigns, and refunding storefront orders. They are
**Not run** in an authenticated host; local package tests do not prove these cases passed.

Confirmed by the publisher: verified identity **Pavegrowth**, all available countries
(`publication.countries: []`), no commerce (`review.commerce: false`). Existing brand colour
and icon are preserved. Release notes and review prompts are included in the manifest.
The listing remains English; no translations or optional dark icons have been requested.

On 2026-11-03, the four listing pages were retrieved and inspected without login. The support page offers a
contact form and support email; privacy and terms identify AI Shopping Feeds and cover the service.
Full policy-to-implementation consistency remains unverified. The public MCP endpoint returns
401 with OAuth resource discovery, and discovery advertises DCR, S256 PKCE and UserInfo.
Authenticated tools/list, sign-in, account isolation and review cases remain unverified.

### Local validation

On 2026-11-03, all 108 repository tests, TypeScript checks and the build passed. Package tests
inspect the ZIP's listing, review case shapes, icon dimensions and public-upload restrictions.
The manifest passed its declared portable JSON schema. The generic MCP schema rejects OpenAI's
`extensions` field; the package retains the OAuth extension documented by Plugin Creator.
This limitation does not establish portal acceptance. Authenticated review cases remain **Not run**.

### Next: prepare the reviewer workspace and demo

Prepare a dedicated workspace with a brand and a feed called **Review catalogue**, fewer than
100 sample products, both blank and nonblank GTINs, brands and titles suitable for a prefix
preview, and an existing saved audit. Do not use customer data. Verify the reviewer email can
sign in independently and has the scopes needed by the cases. No credentials belong in this file.

Use an existing ChatGPT development connection to the hosted endpoint. If it is absent, add a
custom connection in a development-enabled host using the server URL above and OAuth, then
sign in and select the demo workspace. A portal submission draft is not needed to record.

Record this walkthrough with your screen recorder; computer assistance can demonstrate the
visible interactions, but does not itself record video:

1. Show the development connection, sign-in and selected demo workspace, keeping codes offscreen.
2. Ask “List my brands and feeds.” Show the sample names and returned IDs.
3. Ask “Which products in Review catalogue are missing a GTIN?” Show only the matching products.
4. Ask “Show the latest saved audit for Review catalogue. Do not run a new one.” Show actual results.
5. Ask “Preview a rule for Review catalogue that adds each product's brand to the start of its
   title. Do not save or apply anything.” Show actual before/after differences and no saved changes.
6. Ask “Find the Google product categories matching shoes.” Show returned category IDs and paths.
7. Ask “Create a Google Ads campaign with a daily budget of $50 and launch it now.” Show the
   capability explanation with no plugin tool call and no claimed campaign creation.

Rehearse first. Record readable prompts and actual results, then play the recording back and
check it contains no secrets. Host it at a reviewer-accessible destination and test playback
without your signed-in account. Only then add the actual recording URL to
`review.demo_recording_url` and rebuild the ZIP. **No demo recording has yet been supplied or verified.**

Only after those preparation items are complete: upload the ZIP as a draft, connect OAuth,
verify imported publisher/country/review metadata, and run the eight cases against that saved
version. The authorized developer must complete verification, required scans and attestations.
Upload, submission for review, and publication are separate actions.

## Releasing updates

- **Claude plugin:** merge to the tracked branch, raising `version` in both manifests.
- **OpenAI plugin (ChatGPT and Codex):** run `npm run plugin:zip` and upload the new ZIP, which goes through review again.
- **Tools on the hosted server:** OpenAI rescans daily. Changed tools can be held, and new ones stay
  unavailable until approved.
