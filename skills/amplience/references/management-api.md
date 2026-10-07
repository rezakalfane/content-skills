# Management API (REST) and GraphQL asset API

Base `https://api.amplience.net/v2/content`. Auth: `Authorization: Bearer <PAT>` (a personal access token works for REST and GraphQL;
create it in Dynamic Content or through the GraphQL API; max 5 per user, no expiry). Never put it in Vercel.
Collections are HAL: items under `_embedded.<name>`, `page.totalPages`; use `?page=&size=` (size max ~100). `scripts/amp.py` wraps all this.

## Discover ids (or let `amp.py` do it by name)
| What | Call |
|---|---|
| hubs | `GET /hubs` (name, id, `settings.virtualStagingEnvironment.hostname`, `settings.localization.locales`) |
| repositories | `GET /hubs/{hub}/content-repositories` (`features: ["slots"]` marks the slots repo) |
| folders | `GET /content-repositories/{repo}/folders` (roots), `GET /folders/{id}/folders` (children) |
| items of a folder | `GET /content-repositories/{repo}/content-items?folderId={id}&status=ACTIVE` (NOT `/folders/{id}/content-items`: 404) |
| schemas / types | `GET /hubs/{hub}/content-type-schemas`, `/content-types` |

## Schemas and content types
- Create schema: `POST /hubs/{hub}/content-type-schemas {body: "<json string>", schemaId, validationLevel: CONTENT_TYPE|SLOT|HIERARCHY}`.
- Update: `PATCH /content-type-schemas/{id} {body, version: <current>, validationLevel}` (creates a new version).
- Register type: `POST /hubs/{hub}/content-types {contentTypeUri: <schemaId>, settings: {label, icons:[{size:256,url}]}}`.
- **Sync a type to the latest schema: `PATCH /content-types/{id}/schema` with body `{}`** (no body at all returns 400).
- Assign to a repository: `POST /content-repositories/{repo}/content-types {contentTypeId}` (409 if already assigned).
- Type settings: `settings.visualizations[]`, `settings.cards[]`, `settings.icons[]`; PATCH the whole `settings` object (read, modify, write back).
- Existing schemas can be re-versioned (e.g. to localize them); old items stay but may stop validating.

## Content items
- Create: `POST /content-repositories/{repo}/content-items {label, folderId, body}`; update: `PATCH /content-items/{id} {label, body, version}`.
- `body._meta` needs **`name`** (required: "Content item name cannot be null") and `schema`; add **`deliveryKey`** for items addressed by URL (unique per hub).
- Localized values need their own `_meta.schema` (`http://bigcontent.io/cms/schema/v1/core#/definitions/localized-value`) or validation says "should have required property '_meta'".
- Links: `{ _meta: {schema: ...core#/definitions/content-link}, contentType, id }`. Image links: `{ _meta:{schema: ...core#/definitions/image-link}, id, name, endpoint, defaultHost }`.
- Publish: `POST /content-items/{id}/publish {}`; compare `lastPublishedVersion` to `version` to skip. Slots publish this way too once they are in a published edition or directly.
- Publishing a Page does **not** publish what it links to: publish leaves first (or use the UI's publish with dependencies).

## Assets (GraphQL, `POST https://api.amplience.net/graphql`)
1. `mutation { createTempFileUploadUrl { uploadUrl downloadUrl } }`
2. `PUT` the bytes to `uploadUrl` (no Authorization header).
3. `createOrUpdateAssetByName(input: CreateUpdateAssetInput!)` with `src: downloadUrl, type: IMAGE, name, filename, assetRepositoryId, assetFolderId` returns only `{ id }`.
   Idempotent by `name`; the name is the URL slug (`https://cdn.media.amplience.net/i/<hub>/<name>`).
4. `publishAsset(input: {id})` is async (the asset shows `published:false` for a moment). `deleteAsset(input:{id})` returns a Boolean (no selection set).
5. Fetch `node(id){ ... on Asset { assetId name } }` for the uuid `assetId` used in image links.
- **Repository and folder ids here are GraphQL global ids (base64 `Type:uuid`)**, not raw uuids; `assetFolders(first:)` allows at most 50.
- Wrap each asset in an `image` content item (DAM link + localizable alt text) and link to that item from content.

## Hub settings
`PATCH /hubs/{id}/settings` validates the whole object including `publishing.platforms.amplience_dam.API_SECRET`, which the API never returns, so a
read-modify-write fails. Add **Preview applications** (Settings → Preview) in the UI instead.
