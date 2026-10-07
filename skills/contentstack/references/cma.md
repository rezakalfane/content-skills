# Content Management API (CMA)

Base `https://<region-api-host>/v3`. Headers: `api_key: <stack api key>`, `authorization: <management token>`,
`Content-Type: application/json`. A management token is scoped to one stack and environments; it cannot create delivery
tokens.

## Content types

- `GET /content_types?limit=100`, `POST /content_types` with `{"content_type": {"title","uid","schema":[...],"options":{...}}}`,
  `PUT /content_types/<uid>` to change the schema (send the whole schema).
- Field kinds: `text`, `number`, `isodate`, `boolean`, `file`, `link`, `json` (rich text with `field_metadata.allow_json_rte`),
  `reference` (`reference_to: [uids]`, `field_metadata.ref_multiple`), `group` (nested `schema`, `multiple`), `blocks`,
  `taxonomy`. `unique: true`, `mandatory`, `multiple` are field-level flags.
- Singletons: `options.singleton: true` (e.g. site navigation, blog listing). URLs: `options.url_pattern`, `url_prefix`.
- **Reserved UIDs** are rejected (e.g. a field named `recommended_product_ids`: any `*_product_ids` style clash). Pick a
  distinct name (`recommended_bc_products`).
- Plan cap on content types (free: 10). Hitting it gives a creation error; delete only types the user agrees to drop, and
  only after checking they hold no entries.

## Entries

- `POST /content_types/<ct>/entries?locale=en-us` body `{"entry": {...fields}}`.
- `GET /content_types/<ct>/entries?locale=<code>&limit=100&include_workflow=true` (workflow stage appears as `_workflow`
  only with `include_workflow=true`).
- `PUT /content_types/<ct>/entries/<uid>?locale=<code>` replaces the localized version; **file fields must be sent as asset
  UIDs** (strings), not the expanded objects a GET returns, so normalize before PUT. Reference fields are
  `[{"uid": "...", "_content_type_uid": "..."}]`.
- Rich text (JSON RTE) is a document tree `{"type":"doc","children":[...]}`; render with `@contentstack/utils` `jsonToHTML`.
- Create referenced entries first (authors, banners) then the entries that reference them. Publishing validates references.

## Assets

- Upload: multipart `POST /assets` with `asset[upload]` (file), `asset[title]`, optional `asset[parent_uid]`.
- Replace a changed image **in place** (`PUT /assets/<uid>` multipart) so entries keep their reference; seeding by filename
  and skipping existing assets silently ignores updated crops.
- Publish: `POST /assets/<uid>/publish` body `{"asset": {"environments": ["production"], "locales": ["en-us"]}}`.
  Assets are locale-independent files; localized entries fall back to the master asset.

## Publishing entries

```json
POST /content_types/<ct>/entries/<uid>/publish
{"entry": {"environments": ["preview"], "locales": ["fr-fr"]}, "locale": "fr-fr"}
```

A localized publish needs the **top-level `locale`** as well, or it fails. Publish in dependency order. Republishing is safe.
If a publishing rule applies, the call is refused with a message like *"workflow stage requirements specified by the Publish
Rule … have not been met"* (see `workflow.md`).

## Other endpoints worth knowing

`/environments`, `/locales`, `/roles`, `/workflows`, `/workflows/publishing_rules`, `/releases`, `/taxonomies`,
`/global_fields`, `/extensions`, `/webhooks`, `/stack` (settings). Responses wrap the resource under its singular name.

## Hygiene

- Rate limit: 10 requests/second per organization on CMA; back off on HTTP 429 and honour `Retry-After`.
- Redact secrets in every error message the script prints.
- Use `limit` (max 100 for entries) and `skip` to paginate; `include_count=true` returns the total.
