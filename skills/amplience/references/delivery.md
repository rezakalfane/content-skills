# Reading content: Delivery API, environments, images

No SDK needed: plain `fetch` (see `templates/next/lib/amplience.ts`). Published content is public; there is no secret in the storefront.

## Hosts (the whole Production / Preview concept)
| Mode | Host | Sees |
|---|---|---|
| Production | `https://<hub>.cdn.content.amplience.net` | published content only |
| Preview (virtual staging, "VSE") | `https://<id>.staging.bigcontent.io` (hub setting) | latest saved content, drafts included |
| Time-pinned VSE | `<id>-<token>-<unix ms>.staging.bigcontent.io` | content as it will be at that instant (slots and editions resolved) |
Drive it with one env var (`AMPLIENCE_DELIVERY_HOST`, empty = production CDN) and set it only in Vercel's Preview scope.

## Calls
- By key: `GET /content/key/{deliveryKey}?depth=all&format=inlined&locale=fr-FR,en-US` returns `{content}`; 404 if absent. By id: `/content/id/{id}`.
  `depth=all&format=inlined` nests every linked item (slots included) so a Page arrives in one request.
- Lists: `POST /content/filter {filterBy:[{path:"/_meta/schema",value:"<schemaId>"},{path:"/account",value:"..."}], sortBy:{key:"default",order:"DESC"}, parameters:{depth,format,locale}, page:{size,cursor}}`.
  **Page size 1–12 only**; follow `page.nextCursor`. Filtering by schema also returns other teams' items of that schema in a shared hub: add a discriminating filter.
- GraphQL: `https://<hub>.cdn.content.amplience.net/graphql` (schema-generated; handy to explore, not needed).
- Locale param: `locale=fr-FR,en-US` evaluates left to right per field. `locale=*` takes the first locale that has a value.
- Old v1 query (`/cms/content/query?...&scope=tree&store=staging`) still exists on the VSE and is what the built-in cards use.

## Limits and errors
- **Virtual staging: 7 requests/s, 350/min per VSE, shared by every staging read** (latest, timestamp and snapshot modes all count). Over it you get `429`: back off
  exponentially. The CDN has no published rate limit. https://amplience.com/developers/docs/apis/limits/
- Every distinct time-pinned host is a new DNS lookup and TLS connection (slow, ~0.5 s): reuse one host for several requests.
- The VSE **rewrites image links' `defaultHost` to its own domain**; pin images to `cdn.media.amplience.net` (published assets) and blank the host when hashing content.

## Images (Dynamic Imaging)
`https://cdn.media.amplience.net/i/<hub>/<assetName>?w=800&q=75&fmt=auto&upscale=false`. In Next, one global `images.loaderFile` (`templates/next/lib/image-loader.ts`) turns
Amplience URLs into that and sends everything else through Next's optimizer. Video: `/v/<hub>/<name>/mp4_720p`.

## Caching
Production: `fetch(..., {next:{revalidate:60}})` (or a publish webhook + `revalidateTag` for instant). Preview: `cache:"no-store"`. Use React `cache()` to de-duplicate the same read within a render.

## Markdown fields
Render with `marked`; add the locale prefix to site links in the HTML (`href="/x"` becomes `/fr/x`). Content is trusted (editors), so `dangerouslySetInnerHTML` is acceptable.
