---
name: contentful
description: >-
  Build and operate a Contentful-powered storefront or site: model content (content types, locales), seed entries and assets with the Content
  Management API, read content with the Content Delivery and Preview APIs from Next.js, and set up Live Preview / visual editing. Use whenever the
  user mentions Contentful, a space or environment, content types, entries, the CDA/CPA/CMA, a preview token, or wants the Commerce B2B storefront
  rebuilt on Contentful (like the Amplience, ContentStack and Storyblok versions). VERIFIED on the first project (Commerce B2B storefront: model, EN+FR seeding, connection, Live Preview with typed edits, Vercel);
  items still marked VERIFY are untested.
---

# Contentful (verified on the Commerce B2B storefront project)

Follow `cms-storefront-port` for the overall plan (copy `../Storyblok/storefront`, keep the CMS boundary in `lib/`). This skill holds the Contentful-specific facts.
The Contentful connector (`mcp__claude_ai_Contentful__*`) appeared in the available tools; it may offer space/entry operations without handling tokens. Try it first
(authenticate through its tool), and prefer it for exploration; use the API scripts for repeatable seeding.

| Read | When |
|---|---|
| `references/concepts.md` | mapping from Amplience / ContentStack / Storyblok concepts, and what to verify first |
| `references/api.md` | endpoints, versioning, publishing, assets, locales, rich text (all VERIFY) |
| `references/preview.md` | Live Preview, preview URLs, draft vs published, signed requests |

`scripts/cf_api.py` is a secret-safe Management API client (tested: `GET @`, `/locales`, `/content_types`, `@/api_keys`, `@/preview_environments`). Run it with `python3 -I`, from the project (it reads `.env.local`), and in zsh call it through a shell function, not an unquoted `$C` variable (zsh does not word-split it).

## Credentials (same rules as the other CMS skills)
`.env.local` only; names in `.env.example`: `CONTENTFUL_SPACE_ID`, `CONTENTFUL_ENVIRONMENT` (usually `master`), `CONTENTFUL_REGION` (`us` or `eu`), `CONTENTFUL_DELIVERY_TOKEN`
(published), `CONTENTFUL_PREVIEW_TOKEN` (drafts), `CONTENTFUL_MANAGEMENT_TOKEN` (personal access token, seeding only; never to the host or browser).
Never print or ask for token values. Delivery and preview tokens are created in the web app (Settings > API keys); a management token cannot create them (VERIFY).

## First hour checklist
1. Identify the data region (US `api.contentful.com` / `cdn.contentful.com` / `preview.contentful.com`; EU `api.eu.contentful.com` etc.; VERIFY) and the plan limits
   (content types, locales, entries, API rate limit) before modelling.
2. `GET /spaces/<id>/environments/<env>/locales`: add `fr` (VERIFY the exact codes: `en-US` default, `fr` or `fr-FR`).
3. Decide localization: Contentful stores localized fields **per field, per locale** in one entry (like Storyblok's field-level, unlike ContentStack's per-locale entries).
4. Find out the preview options available on this plan (Live Preview, content preview URLs, any newer visual editing product) and choose one with the user.
5. Write down what turned out different from `references/*` right here.


## What turned out different (project 1, verified)
- **Region**: `CONTENTFUL_REGION` must be exactly `us` or `eu`; a trailing `# comment` after the value is fine for the scripts, but a wrong word (the user typed `en`) makes every host lookup fail. Probe `api.contentful.com/spaces/<id>` and `api.eu.contentful.com/spaces/<id>`: only the right region answers (the other gives 404).
- **Tokens**: the three read tokens are created by the user in the web app; with the management token you can only list them (`GET @/api_keys`, `@/preview_api_keys`), never read their values. A new space has `master` and possibly a sandbox environment.
- **Locales**: a new space has one locale (`en-US`). Rename the default with `PUT /locales/<id>` (code `en`, empty space only). `POST /locales` returned **403 AccessDenied with an admin token** until the user freed capacity in the organisation: treat it as a plan limit (Free: 2 locales), not a permission problem, and ask the user. Set `fallbackCode: en` on the second locale.
- **Free plan limits** (documented: 25 content types, 10,000 records, 2 locales, 2-3 environments). Rate limit was not an issue with a 0.12 s pause and a retry on 429 (read `X-Contentful-RateLimit-Reset`).
- **Content types**: `PUT /content_types/<id>` (version header on update) then `PUT .../published`. Links to a type that does not exist yet are accepted (self references and forward references are fine). A RichText field's validations must be **separate objects**: `[{enabledMarks:[...]},{enabledNodeTypes:[...]}]`; one object with both fails with "ambiguous". `linkMimetypeGroup: ["image"]` restricts asset links. Array of Symbol is the way to store lists of strings and (as strings) lists of ids.
- **Entries**: create with `PUT /entries/<id>` plus header `X-Contentful-Content-Type: <type>` (no version header); update with `PUT` and `X-Contentful-Version`; publish with `PUT .../published` and the version returned by the update. A non-localized field takes only the default locale key (`{"en": ...}`); a localized one takes every locale. Publish linked entries before the entries that reference them (related post points to an earlier post). Skipping the write when `fields` are unchanged and `publishedVersion == version - 1` makes reruns instant (36 posts + 62 assets in about a minute, a rerun in seconds).
- **Assets**: upload the file with `POST https://upload.contentful.com/spaces/<id>/uploads` (`Content-Type: application/octet-stream`, EU: `upload.eu.contentful.com`), create `PUT /assets/<id>` with `file.<locale>.uploadFrom` a Link to the Upload, `PUT /assets/<id>/files/<locale>/process`, poll until `fields.file.<locale>.url` exists, then publish. With the French locale falling back to English, only the default-locale file is needed. Asset URLs are protocol-relative (`//images.ctfassets.net/...`).
- **Reading**: `GET /spaces/<id>/environments/<env>/entries?content_type=...&locale=fr&include=3&limit=1000` on `cdn.contentful.com` (published, delivery token) or `preview.contentful.com` (drafts + published, preview token). With a single `locale`, French fields that are empty fall back to English; links to unpublished entries are absent from `includes` (the live site never shows them if unresolved links are dropped). Filtering: `fields.slug=...`, ordering `order=-fields.date`. No SDK is needed: a small fetch wrapper that resolves links from `items` + `includes` is enough and keeps Next's `revalidate`/`no-store`.
- **Content preview URLs (verified in the real editor)**: `PUT /spaces/<id>/preview_environments/<id>` (version header on update) with `{name, description, configurations:[{contentType, url, enabled, example}]}` creates a preview platform with one URL per content type. `{locale}` and `{entry_field.slug}` are expanded; the entry sidebar shows "Open Live Preview" and the URL becomes `.../entries/<id>/preview/<platform-id>?focusedField=...&focusedLocale=...`. A shared secret goes in the URL (`?cf_preview=<secret>`); the editor adds nothing signed itself.
- **Locale switching in the editor is Premium-only** ("Switching locales in live preview is a Premium plan exclusive"): on the Free plan `{locale}` is always the default locale, so the French editor does NOT open `/fr/...`. Workaround accepted by the user: the site's own language switcher inside the preview; inspector tags carry `data-contentful-locale`, so French fields still focus the French field.
- **Live Preview SDK (`@contentful/live-preview` 4.x)**: `ContentfulLivePreview.init({locale, space, environment, enableInspectorMode, enableLiveUpdates, targetOrigin})`. Inspector attributes: `data-contentful-entry-id`, `-field-id`, `-locale` (also `-asset-id`, `-space`, `-environment`). `subscribe('save', {callback})` only fires when **`enableLiveUpdates` is true** (it is gated on it in the SDK), even if no `useContentfulLiveUpdates` data is subscribed. `init` **throws** "The current origin is not supported" when the parent is not Contentful's app (and the page falls into Next's error screen): wrap it in try/catch and, in development only, add the framing page's origin (`document.referrer`) to `targetOrigin` for iframe tests. For server-rendered pages `router.refresh()` on save is enough (drafts are read uncached). Per-keystroke updates need the raw CPA data on the client (`useContentfulLiveUpdates`); with server components that means an overlay mechanism (not built).
- **CSP**: `frame-ancestors 'self' https://app.contentful.com https://app.eu.contentful.com` (localhost in development only).
- **Docs pages may rate-limit WebFetch (429)**: read the installed package's `.d.ts` files in `node_modules` instead, or ask the user for screenshots.
- **Screenshots of the web app** show the space id in the URL and unrelated tabs: crop the top (tabs + address bar) before using them.

## Typed edits (preview overlay) and speed (verified)
- **What works in the real editor**: `ContentfulLivePreview.subscribe({data, locale, callback})` sends `data` (an array of `{sys:{type:'Entry',id}, fields:{...}}` with flat values for the locale) to the editor, which answers with the unsaved values; the callback receives them (accept both a whole data tree and a single entry, with plain or locale-keyed field values). Only subscribe to entries tagged in the DOM.
- **Server-rendered pages**: keep the components; register the draft entries while resolving links, diff the editor's values against the values the page opened with, send changed fields (strings incl. dates and long text, numbers, booleans, lists of strings, rich text documents) to a **server action** that stores them in an in-memory overlay (TTL 5 min, applied to draft reads only) and calls **`refresh()` from `next/cache`** (Next 16): the page re-renders in the same response. Links to entries and media are not overlaid (targets would need fetching); they update on save.
- **Speed lessons (a user saw it lag on Vercel)**: a server action followed by `router.refresh()` is two round trips and Next runs server actions one at a time, so edits queue; use `refresh()` inside the action, one request in flight with newer edits replacing older per entry, a ~120 ms debounce, and a short (5 s) per-instance cache of draft responses emptied on the save event. Result locally: ~0.2 s per change, 12 rapid edits settle 0.2 s after the last. The overlay lives in one instance's memory: on Vercel a render on another instance can miss the latest edit; the next autosave catches up.
- **Guards**: the action re-checks the preview secret, pattern-checks ids/locale/field names, limits value types and sizes (200 KB), and a malformed rich text document must render as empty, not fail the page.
- **Test without the editor**: a parent page on another localhost port listens for the SDK's `SUBSCRIBED` message (`source: 'live-preview-sdk'`, `event: 'edit'`) and answers with `postMessage({source:'live-preview-editor', method:'ENTRY_UPDATED', subscriptionId, data}, '*')` (the SDK does not check the sender's origin on receive). Reference implementation: `scripts/seed-reference/` and the storefront's `components/live-preview.tsx`, `app/actions/preview.ts`, `lib/contentful.ts`.
- **Preview platforms**: one per site origin (production, staging, local https), created by `editor.py` with `PREVIEW_PRODUCTION` / `PREVIEW_STAGING` env vars once the Vercel URLs exist; rerun it after deploying. In the entry sidebar the platform is chosen per entry ("Platform: Staging / Change").
- **Pipeline order that worked**: schemas, seed, verify (CDA + CPA), connect, urltest (dev), preview (iframe test), docs, git + Vercel (link, env per scope piped from `.env.local`, `ssoProtection: null`, git connect, push), then `editor.py` with the real origins. `vercel link` appends `VERCEL_OIDC_TOKEN` to `.env.local` (gitignored; harmless).
