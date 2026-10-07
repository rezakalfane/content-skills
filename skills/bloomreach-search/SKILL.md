---
name: bloomreach-search
description: Build and operate Bloomreach Discovery search on a storefront: load a catalog (e.g. BigCommerce) into a Data Hub item collection (schema, mapping, records, destinations, jobs), query the Search and Autosuggest APIs, render facets, merchandising rules and keyword redirects, build a type-ahead search box and a debug panel of API calls, add content search (FAQ, guides, blog), and deploy. Includes the verified gotchas (engineering host, `fl` must include pid, system attribute family, If-Match, rate limits, stale suggest index). Use whenever the user mentions Bloomreach, Discovery, Data Hub, item collections, a Bloomreach catalog or destination, Autosuggest, facet or ranking rules, or wants search on the Commerce B2B storefront.
---

# Bloomreach Search: load a catalog via the Data Hub API

Status legend: VERIFIED = run against the real systems in this project. DOCS = from Bloomreach docs, not yet run. TODO = unknown.

## Scripts (this skill's `scripts/`)

Tested from here. Run them **from the folder that holds `.env.local`** (or set `ENV_FILE`); call them by path, e.g. `bash ~/.claude/skills/bloomreach-search/scripts/search.sh "exide" 3`.

| Script | What it does | Writes? |
|---|---|---|
| `search.sh "<q>" [rows]` | Query the staging Search API (reads `BR_SEARCH_*`) and print count + top hits | no |
| `build.mjs <outDir>` | Read BigCommerce (products, brands, category tree `BC_TREE_ID`, custom fields) and build `records.jsonl` + `attributes.json` for Bloomreach | no (files only) |
| `apply-schema.sh` | PUT the generated schema (system attributes in family `system`, custom in `main`, `level: parent`, `If-Match`), keeping destinations | **yes**, the guarded collection |
| `load.sh` | build, then POST the records with `update_mode=full` plus `update-items` and `update-destination-items`, poll the job | **yes**, replaces the type's records and re-syncs the destination |
| `load-content.mjs [--dry] [--only=a,b]` | Load FAQ / guide / blog documents from a running storefront's `/api/content/export` into Data Hub custom types (schema + records, waits out 429s) | **yes** (not with `--dry`) |
| `suggest-check.py` | Read-only verdict on whether Autosuggest serves the current catalog (needs `BR_SEARCH_*` in the environment) | no |

**Safety.** Every writing script refuses unless `BR_COLLECTION` equals `BR_GUARD_COLLECTION` (default `demo_rez`), and builds its URLs from the guard name, so it can only ever write to that collection. Test the guard with a copy of the env file via `ENV_FILE=...` (an inline `BR_COLLECTION=...` is overridden by the file). Never run a writing script just to "see if it works": `load.sh` and `apply-schema.sh` really reload and re-sync.

**Project-specific parts of `build.mjs` to adapt for another store:** `BRAND_FIXES`, `stockFor()` (demo stock levels), `BC_TREE_ID`, the custom-field slugging and the keyword rules (`makeKeywords`), and the `product` / `simple_product` item type in `BR_PRODUCT_TYPE`.

## Credentials (never print or commit values)
Kept in `<project>/.env.local`:
- `BR_KEY_ID`, `BR_KEY_SECRET`: HTTP Basic auth (key id = username, secret = password). VERIFIED.
- `BR_WORKSPACE_ID`, `BR_TARGET`, `BR_COLLECTION`, `BR_PRODUCT_TYPE`.
- `BC_STORE_HASH`, `BC_ACCESS_TOKEN`: BigCommerce source.
Check what is set without printing values: `awk -F= '/^[A-Z_]+=/{print $1, ($2==""?"EMPTY":"set")}' .env.local`.
Before writing `.env.local`, check whether it already exists. Overwriting it loses the user's values.

## Base URL
Use `BR_TARGET` (here an engineering host such as `https://us3-api.eng.bloomreach.com`), NOT `https://api.bloomreach.com`. The public host fails to connect (http 000) for engineering workspaces. VERIFIED.

```
B=$BR_TARGET/api/cde/v1/workspaces/$BR_WORKSPACE_ID/item-collections/$BR_COLLECTION
curl -s -u "$BR_KEY_ID:$BR_KEY_SECRET" "$B"          # collection + item types, 200 VERIFIED
```
- The collection response lists `types[]` with `name`, `item_class` (product|custom) and `resource_path`. It does NOT expose the configuration id. VERIFIED.
- Schema config: `GET $B/item-types/$BR_PRODUCT_TYPE/configurations/latest` returns 200. VERIFIED. `latest` is the live configuration; a specific version uses its `etag`. The list path `/configurations` and ids like `main`/`default` return 404.
- The response has `schema.attributes[]`, `schema.identifiers`, `destinations`, `context_dimensions` and an `etag` (use for optimistic concurrency on update). DOCS: update is `PUT .../configurations/{configuration_id}`.
- A fresh collection has the 10 system attributes, each with `source_mapping: {mapping_type: json_field, source_value: ""}`, i.e. UNMAPPED. Each needs a `source_value` naming the record field. `identifiers` is empty.
- Schema update VERIFIED: `PUT .../configurations/latest` with body `{schema:{identifiers, attributes}, destinations}`, header `If-Match: <etag from GET latest>` (428 without it), and every attribute needs `level: "parent"` (400 without it). Returns 200 and a new etag. It replaces the full attribute list, so resend the system attributes too.
- Applied for biggear-b2b: 10 system + `sku`, `image_urls` + 29 custom String attributes (slugified BC custom field names, `display_name` = original name). Builder script: `scripts/build.mjs` in this skill, which writes `records.jsonl` and `attributes.json`. `category_paths` record value: list of paths, each a list of `{id, name}`; mapping type `json_field`. Not yet checked against ingested items.
- Data type names in the API: `String`, `Integer`, `Float`, `Boolean`, `List.String`, `CategoryPaths`.

## Schema (simple_product)
Default system attributes: brand, category_paths (CategoryPaths), stock_level (Integer), title, description, keywords (List String), active (Boolean), price (Float), url, thumb_image (String). Item ID = Record ID.
Custom attributes must be declared before ingesting, with `data_type` and a `source_mapping` (DOCS):
- `mapping_type`: `json_field` | `jmes_path` | `custom_expression` | `builder` (category_paths)
- Attribute body: `{name, item_type, family: "main", data_type, source_mapping:{mapping_type, source_value}}`
Via UI: Schema tab, Add attribute, then "Review and save changes".

## Ingest records (DOCS, not yet run)
```
POST $B/item-types/$BR_PRODUCT_TYPE/records?update_mode=full|delta
Content-Type: application/json-patch+jsonlines
{"op":"add","path":"/<record_id>","value":{"fields":{"title":"...","price":129.99}}}
```
- `add` creates or replaces, `upsert` merges, `remove` deletes.
- `full` deletes all existing records first; `delta` (default) only applies the patch. Use `full` only for the initial or a complete refresh, and confirm with the user first.
- Returns 202 with a job id. Poll `GET $BR_TARGET/api/cde/v1/workspaces/$BR_WORKSPACE_ID/jobs/{job_id}` for state PENDING|SUCCESS|FAILED.
- Records are raw; the schema mapping turns record fields into item attributes. `on_success_trigger=update-items` may be needed to refresh items. TODO: confirm.

## BigCommerce source (biggear-b2b) VERIFIED
```
GET /stores/$BC_STORE_HASH/v3/catalog/products?limit=150&include=images,custom_fields,variants
```
- 151 products in total (150 on page 1, 1 on `page=2`: NOCO jump starter). Remember page 2.
- "Invoice Payment" (id first in list, `type: digital`, no category/brand) is not a real product: exclude it. That leaves 150.
- 149 of 150 on page 1 have categories, custom_fields and brands; all have images.
- Custom fields are name/value pairs, e.g. Technology, Voltage, Dimensions, Warranty, Capacity (Ah), Capacity Range (Ah), UN Code, Terminal Type, CCA, Polarity, Hold-Down, Capacity (mAh), Format, Case Size. Collect the union of names, then declare one custom attribute each.
- `/v3/catalog/categories` returns EMPTY (0) here because categories are per catalog tree. Use:
  `GET /v3/catalog/trees/categories?limit=250&tree_id:in=7` (tree 7 "Envirovent Demo" holds all 13 used categories; found via `category_id:in=<ids>`). Trees list: `GET /v3/catalog/trees`.
- Category paths are 3 levels, built by following `parent_id`: `Products > Automotive Batteries > Car Batteries`. 13 leaf ids (1730-1742) across Automotive Batteries, Leisure & Deep-Cycle, Industrial & Standby, Consumer Batteries, Chargers & Accessories.
- Field mapping: name to title, custom_url.url to url, images (is_thumbnail) to thumb_image, brand_id to brand name (resolve via `/v3/catalog/brands`), inventory_level to stock_level, price to price, is_visible to active, search_keywords to keywords.

## Result VERIFIED (biggear-b2b into demo_rez)
- `load.sh` (guard: refuses unless `BR_COLLECTION=demo_rez`) built and POSTed 150 records with `update_mode=full&on_success_trigger=update-items`. Job state `success` (its `stats` is empty, so verify by listing items).
- Records: `GET $C/records?limit=N`; items: `GET $C/items?limit=N`. Max limit is 100 (200 gives 400); follow `meta.next` to page.
- 150 items. `category_paths` kept the `[[{id,name},...]]` shape, and every item has title, brand, price, url, thumb_image, image_urls and category_paths. Voltage 133/150, technology 139/150 (custom fields vary per product).
- `keywords` is empty on all items: BigCommerce `search_keywords` is blank. Fill it from another source if search needs it.
- The workspace also holds `demo_glen_products`, which must never be written to. The load script is hard-coded to `demo_rez`.

## Discovery catalogs, destinations, facets (DOCS, not run)
- Data Hub does NOT create or delete Search catalogs; they must already exist. No documented API for creating a catalog or a Search destination.
- Destination (UI): Data hub > Items > collection > Destinations tab > + Add destination > Search > pick catalog and environment (staging or production) > Connect > Review and save configuration > Save configuration. `demo_rez` starts with `destinations: []`.
- Facetable/searchable custom attributes: Setup > Catalogs > catalog > Settings > General Settings > Default Attributes Configurations. Facet behaviour Off|Manual|Dynamic and searchability are "Managed by Bloomreach": ask Bloomreach Support. UI only, no API.
- Staging exists by default per account; production is optional.
- Keywords: `build.mjs` derives them (brand, sku, category names, technology, voltage incl. "12v" variant, case size, model, applications). BC brand "FIAM" is a source data typo for FIAMM.

## Destination wiring and the family trap (VERIFIED)
- System attributes (title, price, brand, url, thumb_image, category_paths, description, keywords, active, stock_level) MUST keep `family: "system"`; only custom attributes use `family: "main"`. Writing the system ones as `main` makes the Discovery index fail with `products_no_title_count` and `invalid_products_no_price_data_count` = all products ("No documents were indexed"), even though Data Hub items show title/price. Always GET the existing schema and keep each attribute's family. `build.mjs` now does this.
- Destinations live in the configuration: `destinations: [{name:"discovery", type:"discovery", target:{discovery_account_name, discovery_catalog_name, discovery_environment_name}}]`. A PUT must resend `destinations` unchanged or it drops the connection.
- In this workspace: `demo_glen_products` feeds catalog `demo_glen` PRODUCTION; `demo_rez` feeds `demo_glen` STAGING. Never write to demo_glen_products or production.
- Catalog Attributes tab (Setup > Catalogs > catalog > Attributes) lists custom attributes with Facetable (Off/Manual/Dynamic), Displayable and Searchable controls; all default to Off/unchecked.
- Discovery job log: Setup > Catalogs > catalog > Jobs (Feed: Full Products, Index: Update).
- Search API auth values (domain key, account id, auth key) come from the user; keep them in .env.local, never in this skill.

## Syncing to Discovery (hypothesis, verify)
- `on_success_trigger=update-items` only refreshes Data Hub items. Pushing to the Discovery catalog needs `on_success_trigger=update-destination-items` too (repeat the param), or `POST $C/destination-items` (docs: item_type "product" only, empty body, returns 202 job). After an items-only load the staging search API kept serving old data (305 unrelated products, none of ours). `load.sh` now sends both triggers. Data Hub cannot clear or delete a catalog.
- The Search API (`staging-core.dxpapi.com/api/v1/core/`, params account_id, auth_key, domain_key, request_type=search, search_type=keyword, q, fl, url, ref_url, request_id, _br_uid_2) is a quick check: `q=*` count and `q=<sku>` hit.

## Item type must be `product` for Search destinations
- The destination-items API only supports item_type `product`, so `simple_product` collections will not sync reliably. demo_rez was rebuilt with a `product` type (new type starts with an EMPTY schema and no destinations). Set `BR_PRODUCT_TYPE=product`, run `apply-schema.sh` (guarded to demo_rez; PUT schema with If-Match, keeps destinations), then `load.sh`, then connect the Search destination in the UI (demo_glen / staging). `build.mjs` takes item_type from `BR_PRODUCT_TYPE`.

## Final result VERIFIED
- With item type `product` + `update-destination-items` + the destination connected in the UI, staging indexed all 150 products (old 305 unrelated products gone). Searches: `*` 150, `exide` 7, `vc9596` 1, `agm battery` 27, `12v` 74, `car battery` 22, `button cell` 12.
- Search credentials live in `.env.local` as `BR_SEARCH_ACCOUNT_ID`, `BR_SEARCH_DOMAIN_KEY`, `BR_SEARCH_AUTH_KEY`; `scripts/search.sh "<q>" [rows]` queries staging (`facet.version=3.0` returns the facets).
- Dynamic facets are query-aware: "car battery" returns cca, polarity, terminal_type, start_stop, case_size; "button cell" returns format; `*` returns a mix. Manual facets (technology, voltage, warranty, capacity ranges) are NOT returned until added in the dashboard's facet management.
- BC brand typo: FIAMM products carry brand "Fiam".

## Storefront on top of Bloomreach Search VERIFIED
- Project: `Workspaces/BloomReach/bloomreach-commerce-b2b` (copy of `Workspaces/Amplience/storefront`, package amplience-commerce-b2b). See its `docs/bloomreach.md`. BigCommerce store is the same as the catalog source, so `pid` = BigCommerce product id: Bloomreach returns ids, BigCommerce GraphQL renders the cards.
- Search API quirks: `fl` MUST include `pid` (400 "fl must request pid" otherwise). `fq=brand:"A" OR "B"` ORs values of one field; separate `fq` params AND. `fq=price:[50 TO 100]` works. `search_type=category&q=<id>` includes subcategories; `fq=category:"<id>"` filters a keyword search. `facet.field=<attr>` returns `{name,count}`; the `category` facet returns `{cat_id,cat_name,count}`. `rows` up to 100 per request. Sort: `price asc`, `title asc`.
- Keyword search does NOT match partial words ("exi", "batt", `exi*` all return 0). The Suggest API (`staging-suggest.dxpapi.com/api/v2/suggest/`, needs `catalog_views=<domain_key>`) returned no suggestions for this catalog. The storefront type-ahead completes the last word from a cached vocabulary (titles+brands via `q=*`) and searches the completion; words seen once (model codes) are only suggested as a last resort.
- Type-ahead UI pitfalls: `type="search"` inputs clear their text on Escape (preventDefault when the panel is open); do not call setState synchronously in effects (React lint) - derive loading/data from a per-query store.
- A form with no submit button and more than one text/number field is NOT submitted by Enter: call `form.requestSubmit()` yourself in the keydown handler (caught by a user; a test that only pressed Enter on a highlighted suggestion missed it - always test plain Enter).
- Autosuggest v2: `catalog_views` must be `catalog_name:view_id` (e.g. `demo_glen:default`); responses carry `querySuggestions`, `searchSuggestions` (product docs) and `attributeSuggestions`. For the demo_glen staging catalog every prefix returned empty `querySuggestions` and no other groups (docs: product suggestions need a prefix cache entry; ask the Bloomreach contact).
- Merchandising rules (VERIFIED live on demo_glen staging): facet rules ARE applied by the Search API; with `facet.version=3.0` (or alongside explicit `facet.field`) "charger" returns brand then terminal_type (1 value, "always show"), while a rule-less query ("agm battery") returns its own dynamic set. A storefront that renders only a hard-coded facet list ignores them: render the facets in the order the response returns. A `sort=` parameter overrides ranking-rule order. Rules match the exact query text unless Broad match is on, and must be SAVED in the dashboard (the "booster" product-grid rule did not show in results while it was still in edit mode).
- Debug panel pattern: record each call in the server client (redacted URL, params, ms, status, summary, response cut at 60 KB), return `calls` with the result, and show them in a client drawer; type-ahead calls ride along in the `/api/suggest` JSON (`debug`). Check the served HTML and JSON for the auth key.
- Deployed: Vercel project `bloomreach-commerce-b2b` (team rza-kalfanes-projects) at https://bloomreach-commerce-b2b.vercel.app, GitHub `rezakalfane/bloomreach-commerce-b2b` (private, `main` = production, linked with `vercel git connect`). Production env: BIGCOMMERCE_* (3), AMPLIENCE_HUB_NAME, BR_SEARCH_* (account id, domain key, auth key, ENV=staging, VIEW=default), BR_DEBUG=1; AMPLIENCE_DELIVERY_HOST left unset so production reads the published CDN. `vercel link` rewrites `.env.local` (adds VERCEL_OIDC_TOKEN, keeps the rest). The inherited Amplience workflows were removed from the copy (they would create broken preview deployments). A dev server can serve a stale compiled route handler after an edit (response lacks new fields): restart `next dev`, and make clients tolerate missing fields.
- Redirect rules VERIFIED: the Search API returns `keywordRedirect: {"redirected url", "redirected query", "original query"}` (null otherwise); the storefront 307s to it (`?redirect=off` disables). Facet rules VERIFIED and now rendered: show every facet in the response order; Manual facets (Technology/Voltage/Warranty) must still be requested with `facet.field`. Ranking rules VERIFIED: a rule with 2 products boosted to the top changes the API order (they come first, the rest keeps the algorithm's order); an earlier variant (4 changes that were not effective boosts) did nothing even though it was enabled and saved, and a `sort=` parameter overrides ranking rules. Always re-check a rule against the API, not the dashboard preview.
- Vercel GitHub deployments are BLOCKED ("couldn't find a Git account for the commit author") when the commit email is not linked to the GitHub account: set repo-local `git config user.email "<id>+<login>@users.noreply.github.com"` (id from `gh api user --jq .id`) before committing; poll `vercel api "/v6/deployments?projectId=<p>&teamId=<team>&limit=3"` for the new SHA, not just the newest row.
- Global search: the header search row (`components/header-search.tsx`) is on every page; content that is not in the Bloomreach catalog (FAQ, guides, blog from Amplience) is matched by an in-memory prefix index (`lib/content-search.ts`) and shown beside the product results. A redirect rule's target must keep the visitor's language: localize links to the own site (`/faq` -> `/fr/faq`); absolute or relative targets both work. A production build hides debug output unless `BR_DEBUG=1` (set it when testing locally with `next start`).
- Commit identity for this user: `rezakalfane` / `reza.kalfane@gmail.com` (repo-local git config); Vercel linked that author (the bigcommerce.com email was blocked).
- Project status, next steps and gotchas for the storefront live in its `HANDOFF.md` (read it first when resuming); decisions D40-D44 in `docs/decisions.md`. Data Hub cannot feed a Search content catalog from custom item types (no Search destination offered): content search in Bloomreach needs a content catalog + the Catalog Data Management API (`api.connect.bloomreach.com/dataconnect/api/v1/accounts/{id}/catalogs/{name}/items`, Bearer key, then the index API).
- Media rules VERIFIED: the Search API returns a top-level `campaign` (`bannerType`, `htmlText` with an `<img>`) and inline docs in `response.docs` with `docType: "content"`, `contentType: "image_url"`, `content` (HTML), `dimension` ("1x1"), `slots` ([2]); media docs take part of `rows` and `start` (rows=5 gives 4 products + the image), `numFound` counts products only, they are absent on later pages and for queries without a rule. Treat the HTML as untrusted: extract and validate only the image URL (and optional link), render a plain `<img>`; a product-id filter must skip docs without `pid`. Pagination: use a full page of documents (not `total`) to decide whether there is a next page.
- Autosuggest settings live in Setup > Catalogs > <catalog> > Settings > Autosuggest (Product suggestion, Attribute suggestion + attribute selection, min character count, word count limit); enabling them did not by itself refresh a stale suggest index (checked for ~6 min); product suggestions appear only after a prefix is warmed (cache) and may flicker.
- Autosuggest v2 VERIFIED behavior: works with `catalog_views=<domain>:default` (view name is only echoed; catalog name must be lowercase), proper prefix matching, but on demo_glen staging it serves the OLD tools catalog (category and brand names: hammers, wrenches, klein tools) and nothing from the batteries; `searchSuggestions`/`attributeSuggestions` always empty; production returns nothing. Needs a suggest index rebuild by Bloomreach. Re-check with `scripts/suggest-check.py`.
- Dev check: playwright (python) may want a newer browser build than installed; pass `executable_path` of the cached chromium headless shell.

## Gotchas
- Save raw API responses to the scratchpad directory, not the project.
- Do not print secrets; use `set -a; . ./.env.local; set +a`.
- Send 150 records in one jsonlines POST; no batching needed.
- After loading, verify in the UI (Records, Jobs) and with a Search API query.

## Remaining TODO
1. (Done: GET works with `configurations/latest`.) Confirm the PUT body and etag handling.
2. Declare custom attributes and category_paths builder mapping.
3. Run the ingest and check the job.
4. Confirm the Search API query for verification.
