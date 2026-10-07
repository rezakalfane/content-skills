# API notes (ALL VERIFY: general knowledge, unconfirmed against a live space)

> Verified on project 1: the endpoints below work as written; see 'What turned out different' in SKILL.md for the corrections (locale 403, RichText validations, upload flow, read-side link resolution).

## Hosts and auth
- Content Management API: `https://api.contentful.com` (EU: `https://api.eu.contentful.com`), header `Authorization: Bearer <management token>`, JSON `Content-Type: application/vnd.contentful.management.v1+json`.
- Content Delivery API: `https://cdn.contentful.com/spaces/<id>/environments/<env>/entries` (EU `cdn.eu.contentful.com`), token as `?access_token=` or Bearer.
- Content Preview API: `https://preview.contentful.com/...` (EU `preview.eu.contentful.com`) with the preview token; same shape as the CDA but includes drafts.
- GraphQL: `https://graphql.contentful.com/content/v1/spaces/<id>/environments/<env>` (preview via `?preview=true` or the preview token); an option instead of REST.
- Official packages: `contentful` (delivery client), `contentful-management`, `@contentful/rich-text-html-renderer`, `@contentful/rich-text-react-renderer`, `@contentful/live-preview`.

## Reading
- `GET /entries?content_type=blogPost&locale=fr&include=2&order=-fields.date&limit=100`; `locale=*` returns every locale for each field. Links resolve into `includes` (the SDK
  resolves them in place). `fields.<name>[match]=...` filters; `limit` max 1000; `skip` for paging.
- Assets: `fields.file.url` is protocol-relative (`//images.ctfassets.net/...`): prefix `https:`.
- 404 vs empty: a missing entry returns an empty `items` array on collection queries.

## Writing (management)
- Content types: `PUT /spaces/<id>/environments/<env>/content_types/<id>` with `{ name, fields: [...] }`, then **publish** with `PUT .../content_types/<id>/published` and the `X-Contentful-Version` header.
- Entries: `PUT .../entries/<id>` (or POST with `X-Contentful-Content-Type`), body `{ fields: { title: { 'en-US': '...', fr: '...' } } }`; every update needs `X-Contentful-Version` (the current version);
  publish with `PUT .../entries/<id>/published` and the new version. Idempotent seeding: use fixed entry ids.
- Assets: `PUT .../assets/<id>` with `fields.file['en-US'] = { fileName, contentType, upload: '<public url>' }`, then `PUT .../assets/<id>/files/<locale>/process`, wait until processed, then publish. Local files
  need an upload resource first (`https://upload.contentful.com/spaces/<id>/uploads`).
- Locales: `POST .../locales { name, code, fallbackCode, optional }`.
- Rate limit is per second (single digits to tens); back off on 429 using `X-Contentful-RateLimit-*` headers.
- Rich text documents are `{ nodeType: 'document', data: {}, content: [{ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value, marks: [], data: {} }] }] }`; headings `heading-2`, lists
  `unordered-list` > `list-item` > `paragraph`, links `hyperlink` with `data.uri`.
