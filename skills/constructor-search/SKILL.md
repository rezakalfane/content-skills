---
name: constructor-search
description: Build and operate Constructor (constructor.io, ac.cnstrc.com) search on a storefront: load a catalog (e.g. BigCommerce) into an index (items, item groups, facets, searchabilities, sorts, synonyms), query the Search, Browse and Autocomplete APIs from Next.js, render facets, redirects, rules and facet campaigns, send behavioral tracking events with the client library, and show a debug panel of the calls. Includes the verified gotchas (Basic auth, section on items but not groups, v2 groups with parent_ids, whole-set PUTs, index latency, partial words, the bot check that drops events). Use whenever the user mentions Constructor, Constructor.io, cnstrc, an index key, item groups, facet campaigns, autocomplete select events, or wants search on the Commerce B2B storefront (the constructor-commerce-b2b port of the Bloomreach version).
---

# Constructor search

Status legend: **VERIFIED** = run against the real index (key `key_fWBvGxve8KzBSkXm`, index "Reza") in the Commerce B2B project. **DOCS** = from the docs, not run.

Reference implementation: `~/Workspaces/ConstructorIO/constructor-commerce-b2b` (the Bloomreach storefront ported to Constructor; read `docs/constructor.md` there).
Loader and config scripts: this skill's `scripts/` (also in that repo's `scripts/constructor/`). The long cookbook of every call is `~/Workspaces/ConstructorIO/IMPORT.md`
(copied to `docs/constructor-catalog.md` in the repo).

## Credentials and basics

- **Index key** (`key_...`): public. Goes in every call as `key`, and to the browser for tracking. Env: `CONSTRUCTOR_INDEX_KEY`.
- **API token**: secret, **scripts only** (never in Vercel, never in the browser). Env: `CONSTRUCTOR_API_TOKEN` in `.env.local`. Never print it.
- Auth for write/config calls: HTTP Basic, token as username, empty password: `curl -u "$CONSTRUCTOR_API_TOKEN:"`. Public calls (search, browse, autocomplete, tracking) need only `key`.
- Host `https://ac.cnstrc.com`. `c=<client label>` is free text (scripts use `cio-demo-loader`, the storefront `cio-b2b-storefront`).
- Public read calls require `i` (client id) and `s` (session id); add `us` (segments, repeatable) for personalization.
- Every write returns `{"task_id": N}`: poll `GET /v1/task/{id}` (`DONE` or `FAILED` in seconds). `DONE` means stored, **not** searchable yet.

## Loading the catalog (VERIFIED)

1. `node scripts/build-catalog.mjs <bc-env-file> data/catalog` reads one BigCommerce channel (read-only) and writes `items.jsonl` + `item_groups.jsonl`.
   Item `id` = **BigCommerce product id** (so the storefront renders cards from BigCommerce by id). Every custom field becomes a snake_case key under `data`,
   plus numeric twins (`voltage_v`, `capacity_ah`, `cca_a`) for range facets and numeric sorts. Groups carry `data.bc_category_id` (needed to map BC categories to groups).
2. Full replace in one step: `PUT /v1/catalog?key=K&section=Products&format=jsonl&force=true&c=...` with `-F items=@items.jsonl -F item_groups=@item_groups.jsonl`.
   It deletes what is not in the files. `force=true` is needed when more than 50% of a part would be removed. A file you leave out is untouched.
3. Delta: `PATCH /v1/catalog` (adds/updates only what is in the files). `PUT` = replace, `PATCH` = update, everywhere.
4. `node scripts/configure-index.mjs [--dry-run]`: facets, searchabilities, sort options, synonyms (idempotent).

### Gotchas that cost time (all VERIFIED)

- **`section=Products` is required on item calls and must be left off item-group calls** (`section: extra fields not permitted`).
- **v1 group endpoints are disabled** when the account has multiple group parents: use v2 with `parent_ids` (array). v2 has no single-create: `PUT /v2/item_groups` replaces the **whole tree**, so resend every group plus the new one. `PATCH` updates existing groups only.
- `group_ids` on an item must name groups that already exist; an unknown id is silently dropped (`group_ids: null`).
- `PUT /v2/items` replaces the **whole item list**. Use `PATCH ...&on_missing=CREATE` for single products. To hide an item but keep its learnings set `"active": false`.
- v2 item calls take **arrays** (max 10,000). Max 25 facets in the facets PUT. Searchabilities upsert up to 60 per call (`skip_rebuild=true` to batch).
- Facet `path_in_metadata` is the key under `data`. Types: `multiple`, `range`, `hierarchical`.
- Searchability and facet changes need an **index rebuild**: first build after a catalog replace about 3 minutes; rules, redirects and facet campaigns took **5 to 15 minutes** to show (deleted ones linger as long).
- The docs site (`docs.constructor.com`) shows a bot challenge after a burst of requests: fetch one page at a time.
- **Open (not solved):** `exact_searchable` fields (`sku`, `mpn`, `gtin`) returned 0 for values that are not also in the item name; the built-in `id` works. Try adding them to `keywords`, or ask support.
- A first note claiming MPN search worked was wrong (the MPN was in the name). Test exact-ID fields with values that appear nowhere else.

## Merchandising API (VERIFIED, scripts in `scripts/`)

- **Redirect rules**: `POST /v1/redirect_rules` `{url, matches:[{pattern, match_type: EXACT|PHRASE|UNORDERED}]}`. Appears as `response.redirect.data.url` in Search and Autocomplete. A redirect replaces the whole results page: **never redirect a term that needs its own search page** (a "charger" redirect made that page unreachable).
- **Query rules**: `POST /v1/refined_queries?section=Products` with `query` and any of `boost_rules`, `blacklist_rules`, `whitelist_rule`, `slot_rules`. Addressed by numeric id (a 409 on create tells you the id; `GET` lists): replace with `PUT /v1/refined_queries/{id}`.
- **Browse rules**: `PUT /v1/refined_filters/{filter_name}/{filter_value}` (category page = `group_id/<group id>`; facet page = `<facet>/<value>`). Same rule types.
- **Facet value rules**: `PATCH /v1/facets/{facet}/options` array of `{value, display_name, position, hidden}`.
- **Facet campaigns** (which facets show on a page): `POST /v1/facet_rule_campaigns` with `refined_queries` / `refined_filters` and `blacklist_rules` / `slot_rules` (`target: facet_group`). This works and is visible: the chargers page returned 6 facets instead of 14.
- **Segment-targeted rules (VERIFIED)**: `POST /v1/campaigns` with `name`, `refined_queries:[{query}]`, `request_tag_name: "user_segment"`, `request_tag_value: "<segment>"` and `boost_rules:[{request_tag_name, request_tag_value, rule:{filters, boost}}]`. The tag must be repeated on every rule (else 400), and `boost` is at most 10. A visitor sees it when the request carries `us=<segment>`. Live in about 2 minutes here. Plain `refined_queries` rules do not accept `segments`. Script: `scripts/configure-segment-campaigns.mjs`. Other tag names: client_ip, geo_*, dt_weekday, dt_timeofday, dynamic_segment. No API endpoint for A/B tests was found (`/v1/experiments`, `/v1/ab_tests` are 404). The dashboard has them under **Analytics → A/B Testing** (not Workspace): Global Search / Global Browse A/B tests, which measure **global rules** (Searchandizing → Global Rules; no API for those either). Query-level or segment-targeted tests: run the split in the storefront (hash the client id into a segment, target a campaign at it). Collections, Recommendations and Quizzes may be greyed out in the sidebar (not enabled on every instance).
- There is **no public endpoint for global rules** (apply to every query) or Autosuggest-only rules.
- Facet value rules and the car-batteries facet order were saved and read back but not seen live; recheck, or use the dashboard.

## Querying from the storefront (VERIFIED)

- Search: `GET /search/{q}`; Browse: `GET /browse/group_id/{id}` (`all` = whole catalog); Autocomplete: `GET /autocomplete/{q}?num_results_Products=5&num_results_Search%20Suggestions=5`.
- Common params: `section=Products`, `num_results_per_page`, `page` (1-based), `sort_by` + `sort_order` (`ascending|descending`), `filters[brand]=A&filters[brand]=B` (**OR within a facet, AND across**), `filters[price]=10-50` (`-inf` / `inf` open ends), `filters[group_id]=car-batteries` (text search inside a category), `fmt_options[groups_max_depth]`.
- Response: `response.results[].data.id` (our BC id), `response.facets[]` (`multiple` have `options[{value,count}]`; **`range` facets have `min`/`max` and no options**), `response.groups` (tree with `count`, `data.bc_category_id`), `response.total_num_results`, `response.redirect`, top-level `result_id` (**tracking events must repeat it**).
- Facet names in the response are the `path_in_metadata` keys (lowercase snake_case); map them to display labels yourself or use `display_name`.
- **Typos are corrected silently** ("exide batery" finds Exide, no `did you mean` field): there is nothing to show as a "showing results for" notice.
- **Partial words: Search does not match them ("exi" returns 0); Autocomplete does** (prefix matching on products). Pattern in the reference: take Autocomplete's products, complete the last word from their names and brands, search with the completion (`cioSearchSmart`).
- **Search Suggestions in Autocomplete are empty** until Constructor learns from searches and events. The Products section works from day one.
- Category page: Browse by the group id. BC `categoryId` to group id via the `data.bc_category_id` of the groups tree (read once, cache).
- `sort_by=name` works for the name sort configured as `{sort_by:"name"}`; sort options are only the ones configured (`GET` shows them in `response.sort_options`).

## Visitor identity

- Browser library cookies: `ConstructorioID_client_id` (UUID, 365 days), `ConstructorioID_session_id` (integer) and `ConstructorioID_session` (JSON `{sessionId,lastTime}`, 30 min sessions).
- **Create the client id in the proxy on the first request** and put it in the request's own cookie header too, so the first server-rendered search already has a visitor; the library then keeps using it. A fixed server-side id puts everybody in one A/B bucket and breaks personalization.
- The library keeps the session id in **local storage by default**, which the server cannot read. Ask for `idOptions: { session_id_storage_location: "cookie" }` and read `ConstructorioID_session_id` on the server (fall back to `1`).
- Segments: send as `us=<name>` (repeatable); a rule or campaign targeting a segment of that name applies.

## Tracking (behavioral events), VERIFIED in a browser

Library `@constructor-io/constructorio-client-javascript` (2.94.1): `new ConstructorIO({ apiKey, sendTrackingEvents: true, idOptions: {...} })`.

| Moment | Call |
|---|---|
| first page of a visit | `tracker.trackSessionStart()` |
| search listing shown | `trackSearchResultsLoaded(term, {url, items:[{itemId}], resultCount, resultPage, resultId, section})` |
| browse page shown | `trackBrowseResultsLoaded({url, filterName:"group_id", filterValue, items, resultId, ...})` |
| click on a result | `trackSearchResultClick(term, {itemId, itemName, resultId})` / `trackBrowseResultClick({filterName, filterValue, itemId, ...})` |
| product page | `trackItemDetailLoad({itemId, itemName, url})` |
| add to cart | `trackConversion(term, {itemId, revenue, type:"add_to_cart"})` (`TERM_UNKNOWN` when there is no search term) |
| type-ahead entry chosen | `trackAutocompleteSelect(term, {originalQuery, section, itemId})` (`section` is the Autocomplete section: `Products`, `Search Suggestions`) |
| search submitted | `trackSearchSubmit(term, {originalQuery})` |
| order placed | `trackPurchase({orderId, revenue, items:[{itemId, itemName, price, count}]})` |

**The library drops events from bots, and before the first human interaction** (mouse, scroll, key, touch, focus). Consequences:
- the first page view of a fresh load is lost unless you hold events until the first interaction (done in `lib/cio-tracker.ts`: a waiting list flushed on the first human event);
- `navigator.webdriver === true` is always a bot: Playwright sends **nothing** until you hide it (`addInitScript(() => Object.defineProperty(navigator, "webdriver", {get: () => false}))`), set a normal user agent (`HeadlessChrome` is also in the bot list) and move the mouse;
- events are queued in local storage and sent after `trackingSendDelay` (250 ms default).
React strict mode runs effects twice in development: dedupe page views by URL + data. Search for `behavioral_action` requests (POST) and `/autocomplete/<q>/select|search|click_through` (GET) in the network tab to confirm.
Events were confirmed **sent**; acceptance in the dashboard's tracking monitor was not checked.

## Next.js integration shape (the reference repo)

`lib/constructor.ts` (server: search, browse, autocomplete, recorded fetch for the debug panel), `lib/visitor.ts` + `visitor-edge.ts` (ids), `lib/segments.ts`,
`lib/cio-tracker.ts` + `components/cio-tracking.tsx` (browser events, `CioPageView`, `useTracker`), `lib/cio-page.ts` (page data built on the server),
`components/cio-debug-panel.tsx` (This page, Search box, Events, Segments tabs), `app/api/suggest/route.ts` (type-ahead endpoint), `proxy.ts` (client id cookie, `?segment=`).
Product cards carry `data-cio-item` / `data-cio-name` so one document-level click listener can report result clicks. The index key is public; keep the API token out of the app.
Porting an existing storefront from another search engine: keep the page components, swap the data layer, delete engine-specific features (media rules, "did you mean", content sync), rewrite the docs.

## Not solved / ideas

Exact-ID search on `sku`/`mpn`/`gtin`; content (FAQ, guides, blog) as a second index section; French fields in the index; personalization and A/B test setup in the dashboard; checking events in the dashboard.
