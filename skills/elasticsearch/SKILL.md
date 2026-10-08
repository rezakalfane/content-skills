---
name: elasticsearch
description: Operate Elasticsearch (serverless or Cloud) with the `elastic es` CLI and the REST API, and load the B2B Commerce catalog (BigCommerce channel products) and Amplience content (FAQ, buying guides, blog) into indices with hybrid lexical + semantic search. Covers CLI setup and the packaging fix, the `.env.local` variables, mapping design (semantic_text, copy_to, search_as_you_type), bulk loading with a write guard, and verified query recipes (match, semantic, RRF hybrid, aggregations, ES|QL). Use whenever the user mentions Elasticsearch, Elastic Cloud, the `elastic` CLI, an ES index, semantic_text, ES|QL, or wants search on the Commerce B2B storefront backed by Elasticsearch.
---

# Elasticsearch: CLI, REST, and loading the B2B catalog

Status legend: VERIFIED = run against the real cluster in this project (serverless 9.6.0, Lucene 10.5.1). DOCS = from Elastic docs, not run here.

## Scripts (this skill's `scripts/`)

Run them **from the folder that holds `.env.local`** (or set `ENV_FILE`), by path: `node ~/.claude/skills/elasticsearch/scripts/<name>.mjs ...`. Needs Node 18+.

| Script | What it does | Writes? |
|---|---|---|
| `lib.mjs` | Shared: loads `.env.local`, `es(method, path, body)`, `guard(index)`, `ensureIndex`, `bulkIndex` (batches of 50, retries 429/503). Never prints the key | n/a |
| `build-products.mjs <outDir>` | Read BigCommerce products of ONE channel (`BC_CHANNEL_ID`), brands, the channel's category tree and custom fields; write `mapping.json` + `products.json` | no (files only) |
| `build-content.mjs <outDir> [en,fr]` | Read the storefront's `/api/content/export` (needs the storefront running) and write `content-mapping.json` + `content.json` | no (files only) |
| `setup-events.mjs [--recreate]` | Create the guarded `search-events` index (mapping in `events-mapping.mjs`: strict, one flat document per event) | **yes**, guarded |
| `seed-events.mjs [days=45] [--dry]` | Seed SYNTHETIC demo traffic (`synthetic: true`) for the merchandiser dashboard: runs ~60 demo queries against the real `products` index (lexical query, filters, semantic fallback, did-you-mean), then simulates sessions, clicks, carts and orders over the days; re-running deletes only the previous synthetic events. Use `--dry` to see the counts first; the storefront needs 90+ days so a 30-day view has a full previous period | **yes**, guarded |
| `load-index.mjs <index> <mapping> <docs> [--recreate]` | Create the index, bulk-index `[{id, doc}]`, refresh, verify the count | **yes**, guarded index only |

Typical run:
```
node build-products.mjs /tmp/es-build
node load-index.mjs products /tmp/es-build/mapping.json /tmp/es-build/products.json --recreate
node build-content.mjs /tmp/es-build
node load-index.mjs content /tmp/es-build/content-mapping.json /tmp/es-build/content.json --recreate
```
VERIFIED result: `products` = 150 docs (visible, physical products of the channel; 54 brands, 13 category paths, 29 spec fields), `content` = 114 docs (15 FAQ + 6 guides + 36 blog posts, in en and fr). Zero bulk failures.

**Safety.** Writing scripts refuse any index not listed in `ES_GUARD_INDEX` (comma-separated, here `products,content`). `--recreate` DELETES the index first, so only use it on these two. Never run a writing script just to "see if it works".

**Project-specific parts of `build-products.mjs` to adapt for another store:** `BRAND_FIXES`, the custom-field handling (`specs`), the `in_stock` / `stock_level` rule, the dropped root category ("Products").

## Credentials (never print or commit values)
In `<project>/.env.local` (check set/empty without printing: `awk -F= '/^[A-Z_]+=/{print $1, ($2==""?"EMPTY":"set")}' .env.local`):
- `ES_URL`, `ES_ADMIN_API_KEY`: used by the loading scripts and curl (full access; never give it to the storefront).
- `ES_EVENTS_API_KEY`: write-only (`create_doc` on `search-events`); the storefront uses it to log search analytics. Also made in Kibana.
- `ES_READONLY_API_KEY`: `read` on `products`, `content` and `search-events` (the dashboard), plus cluster `monitor_inference` if the reranker is used; the storefront uses only this one. A key made with an API key cannot have privileges, so create it in Kibana (Dev Tools: `POST /_security/api_key` with `role_descriptors` giving `read` on those indices). Before testing that it is read-only (a `_search` gives 200, a write to a throwaway id gives 403), confirm the key being used really is the read-only one (compare hashes of the two keys, never print them): run write tests against a key you have not confirmed and they WILL write (this once deleted the `content` index).
- `ES_INDEX`, `ES_CONTENT_INDEX`, `ES_GUARD_INDEX` (`products,content`).
- `BC_STORE_HASH`, `BC_ACCESS_TOKEN`, `BC_CHANNEL_ID`: BigCommerce source. The channel id (not a tree id) drives both the product filter (`channel_id:in=`) and the category tree (`/v3/catalog/trees?channel_id:in=`). VERIFIED.
- `CONTENT_EXPORT_URL` (default `http://localhost:3300`), `CONTENT_EXPORT_TOKEN`: the storefront must be running with the same token in ITS env. If the token is empty the route answers 404; a wrong one gives 401. Do not export an empty `CONTENT_EXPORT_TOKEN` into the shell that starts the storefront: it overrides the storefront's own `.env.local`.
Before writing `.env.local`, check whether it exists; overwriting loses the user's values.

## The `elastic` CLI

`elastic es <namespace> <command>` mirrors the REST API (`elastic es --help`, `elastic es search --help`). The CLI keeps its context (URL + key in the keychain) separately from `.env.local`; `elastic es info` is the smoke test.

**Packaging fix (VERIFIED).** `@elastic/cli` 0.6.0 ships `@elastic/agent-env` with `main`/`exports` pointing at `src/index.ts`; Node 24 refuses to strip types under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`). Fix: edit `node_modules/@elastic/agent-env/package.json` inside the global install so `main` and `exports.default` are `./dist/index.js`. A reinstall overwrites it; re-apply.

**Input rules (VERIFIED).**
- Bodies go through `--input-file <path>`; `--input-file -` reads stdin. Body fields (`query`, `size`, `retriever`...) and path/query params like `index` live in the same JSON object.
- `--operations` needs a JSON array.
- In input files, booleans-as-params such as `refresh` must be the string `"true"`.
- Deletes need `--yes`.

```
echo '{"index":"products","size":3,"_source":["name"],"query":{"match":{"name":"agm"}}}' | elastic es search --input-file -
echo '{"query":"FROM products | STATS n = COUNT(*) BY brand | SORT n DESC | LIMIT 5"}' | elastic es esql query --input-file -
elastic es cat indices
elastic es inference get          # list inference endpoints
```

## Index design (VERIFIED on this cluster)

- **`semantic_text`** works with the default endpoint: no inference setup. Add one `semantic` field and `copy_to` it from `name`, `brand`, `description`, `category_paths` (products) or `title`, `description`, `text` (content). The default model is multilingual enough that a French FAQ answers an English query (and vice versa); filter on `locale` to stay in one language.
- Other endpoints on the cluster: ELSER, Jina and OpenAI embeddings, Jina and Elastic rerankers (`elastic es inference get`). Use `inference_id` on the field to pick one; rerank with a `text_similarity_reranker` retriever.
- `name`: `text` + `.keyword` + `.suggest` (`search_as_you_type`) for type-ahead. `sku`: `keyword` + `.text`.
- Prices as `scaled_float` (factor 100). URLs and image fields `keyword` with `index: false`.
- Spec fields vary per product, so `specs.*` use a dynamic template mapping them to `keyword` (`ignore_above: 256`): terms facets work, no mapping explosion from numeric guesses.
- Set `ES_SEMANTIC=false` to drop the semantic field (no inference cost).
- Serverless: no shard/replica settings; do not pass them.

## Query recipes (VERIFIED)

Lexical:
```json
{"query":{"multi_match":{"query":"agm start stop battery","fields":["name^3","description","brand"]}}}
```
Semantic (natural language; `semantic` is the field name):
```json
{"query":{"semantic":{"field":"semantic","query":"battery for a car with start-stop that will not leak"}}}
```
Hybrid with RRF (best default for a search box):
```json
{"retriever":{"rrf":{"retrievers":[
  {"standard":{"query":{"multi_match":{"query":"exide agm 60Ah","fields":["name^3","brand","sku.text"]}}}},
  {"standard":{"query":{"semantic":{"field":"semantic","query":"exide agm 60Ah"}}}}
],"rank_window_size":50}}}
```
Facets and filters: `term` on `brand`, `categories`, `in_stock`, `specs.voltage`; `terms` aggregations on the same keyword fields.
Products and content together: `"index":"products,content"` with a semantic query (hits carry `_index`; read `name` or `title`). Content-only: filter `content_type` (`faq`, `buying_guide`, `blog_post`) and `locale`.
ES|QL: `FROM products | WHERE in_stock == true | STATS n = COUNT(*), avg_price = AVG(price) BY brand | SORT n DESC | LIMIT 3` through `elastic es esql query`.

## Search analytics and the merchandiser dashboard (VERIFIED)
The storefront logs four events (search, click, add_to_cart, order) to `search-events` and shows them at `/insights` (see the storefront repo's `docs/elasticsearch.md`). `sx` links a click, a cart or an order to the search it came from; `sid` is a random per-tab id (no cookie). Definitions: click-through = searches with a click / searches; "no word match" = `via` is meaning or none (the words found nothing); empty page = `total` 0.
- The cluster has **chat and completion endpoints** (Claude, Qwen, GLM, Kimi) and several rerankers (`.jina-reranker-v3` works; `.rerank-v1-elasticsearch` fails here). A `text_similarity_reranker` retriever needs a key allowed to call inference (`monitor_inference`); a plain read key gets 403 and the storefront falls back to words.
- The term suggester (`suggest_mode: missing`) judges "missing" **per shard**, so a word that exists on another shard still gets suggestions ("start stop" -> "starter stop"). Check each word against the catalog vocabulary before accepting a correction; skip it for natural-language and non-English queries.
- `rank_window_size` of an RRF or reranker retriever must be at least `from + size`; RRF totals follow its candidate set. For "the N closest by meaning" run the semantic query for N ids, then re-query with a `pinned` query on those ids so total, facets and sort stay consistent.
- Seeding: never write test events with the admin key into a live index without marking them; delete test events afterwards with `_delete_by_query` on `synthetic: false` only when you know nothing live exists.

## Gotchas
- Bulk: use NDJSON with `Content-Type: application/x-ndjson`, a trailing newline, and check `items[].index.error`; HTTP 200 does not mean every document succeeded. `lib.bulkIndex` does this.
- Documents are indexed by a stable `_id` (BigCommerce product id; Amplience content id), so reruns without `--recreate` upsert instead of duplicating.
- New documents are searchable after the refresh (about 1s on serverless); `load-index.mjs` refreshes before counting.
- Semantic fields embed at index time, so a bulk with `semantic_text` is slower and may return 429/503 under load: `bulkIndex` retries with backoff.
- The content export runs inside a Next.js storefront (Amplience loaders), so a storefront must be up for `build-content.mjs`: `Elasticsearch/elastic-commerce-b2b` (`next dev -p 3300`, same `CONTENT_EXPORT_TOKEN`) or the Bloomreach one. Stop it afterwards.
- The search UI is the storefront `Workspaces/Elasticsearch/elastic-commerce-b2b` (`lib/elastic.ts` implements the queries below: lexical with prefix and fuzzy, SKU exact, semantic fallback as top-20 ids + `pinned`, optional RRF). Its docs: `docs/elasticsearch.md`.
- RRF `rank_window_size` must be >= from + size, and RRF totals follow its candidate set, not the window. `semantic` scores are flat across a small catalog (even nonsense queries score ~0.59), so cut by top-N, not by score.
- A `category_ids` field must include the ancestors of each product's categories for category pages to list subcategory products (done in `build-products.mjs`).
- Content-skills sibling: `bloomreach-search` loads the same catalog and content into Bloomreach; the builders here mirror its `build.mjs` / `load-content.mjs`.

## Ideas not done yet (TODO)
Dynamic facets per category, synonyms set (`elastic es synonyms`), a reranker stage, query-time boosting for in-stock items, an alias (`products_v1` -> `products`) for zero-downtime reloads.
