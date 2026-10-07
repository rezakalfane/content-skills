# Next.js (App Router) integration, verified on Next 16 + @storyblok/react 7

Packages: `@storyblok/react` (bridge + live editing), `storyblok-js-client` (Content Delivery client), `@storyblok/richtext`
(`renderRichText(doc)` returns an HTML string). Removing the ContentStack packages and adding these is the whole dependency change.

## Two ways to render
- **Registry:** `storyblokInit({ components })` + `<StoryblokStory story={…}/>` renders the story with one React component per
  Storyblok component. Best for a page-builder site.
- **Hybrid (used here):** keep existing page components, fetch with the JS client, map each story into the plain shape the
  components read, and add `<StoryblokLiveEditing story={{ id }} bridgeOptions={{ resolveRelations }}/>` from `@storyblok/react/rsc`.
  Storefront pages that mix CMS and commerce data fit this better.

## Data layer pattern
- Two clients: preview token for `version: "draft"`, public token for `"published"`. Same call shape; the token decides visibility.
- `get("cdn/stories/<slug>", { version, language, resolve_relations }, fetchOptions)`: the JS client **merges `rels` into `content`
  in place** (unlike the raw API). Pass `{ cache: "no-store" }` for drafts and `{ next: { revalidate: 60 } }` for published.
- 404s reject: catch `status === 404` and return `undefined` so pages can `notFound()`.
- `language: "default"` is the default language; others by code (`fr`).
- Wrap fetchers in React `cache()` so `generateMetadata`, the page and the layout share one request (and the live-edit cache is
  consumed once).
- Resolve **one level** of relations. For shared lookups (authors) fetch the folder once and map by uuid instead of resolving
  `post.author` on every post (and `related_post.author` is not resolved by `resolve_relations`).
- Folder start page is requested by the folder slug (`blog`, `guides`).

## Visual Editor (preview) handshake
- The editor opens the site with `?_storyblok=<space id>` and signed params `_storyblok_tk[space_id|timestamp|token]`.
  `token = sha1("<space_id>:<preview token>:<timestamp>")`. **Validate it** (and that the timestamp is < 1 hour old) before serving
  drafts, otherwise `?_storyblok=1` leaks unpublished content. Skip validation only in development.
- **Edit attributes:** `storyblokEditable(blok)` → `data-blok-c` (JSON of `{name, space, uid, id}`) and `data-blok-uid` (`<storyId>-<uid>`);
  built from the `_editable` comment on draft content. Storyblok selects a **block**, not a field, so every field of a block can
  share the same attributes. Only emit them in preview so published HTML is clean.
- **Live editing in RSC:** `StoryblokLiveEditing` (client) loads the bridge when the page is inside the editor iframe. On each `input`
  event it calls a server action that stores the unsaved story in `globalThis.storyCache` (keyed by story id) and revalidates the
  path; the server render then reads that cache. Saving (`change` / `published`) reloads the page.
- The unsaved story from the bridge carries **all languages** as `field__i18n__<code>`: copy the active language over the base
  field before mapping, or French edits will not show.
- `isVisualEditor()` = in an iframe and `location.search` contains `_storyblok`; outside it the component renders nothing.

## Config
- `images.remotePatterns`: `a.storyblok.com`.
- CSP `frame-ancestors 'self' https://app.storyblok.com https://*.storyblok.com` so only the editor can embed the site.
- The space's preview URL (Settings → Visual Editor) must point at the deployed/dev URL; set the default path per content type
  (Storyblok does not know your routes; `home` is `/`).

## Visual Editor setup in the space (Management API)
- **Preview URLs:** `PUT ""` `{"space": {"domain": "<default URL>", "environments": [{"name": "Production", "location": "https://…/"}, …]}}`.
  The editor opens `<environment location><story path>`. The location must be **https** (local: `next dev --experimental-https`, accept the
  certificate once in a tab).
- **Do not use "real path" on translated stories.** `PUT /stories/<id>` `{"story": {"path": "/faq"}}` is used by the editor as-is and **drops the
  language prefix**: the French editor then opens the English page (found when Home, with real path `/`, stayed English while a guide
  without one correctly opened `/fr/guides/...`). Clear it (`path: ""`) and map stories that have no page of their own in the app instead:
  in `proxy.ts`, only when `_storyblok` is in the query, rewrite `home`/`fr/home` and folders such as `faqs/`, `authors/`, `spotlights/`,
  `settings/` to the pages that show them.
- **Languages:** the editor requests the **language code as a path prefix** (`fr/guides/...`, `fr/home`): route `/fr/...` natively and make the
  proxy map `/home` and `/fr/home` onto the real home pages. `_storyblok_lang` is also appended (`default` or the code/id).
- **The bridge is bundled** in current `@storyblok/js` (dynamic import of `@storyblok/preview-bridge`), not loaded from a CDN: there is no
  `storyblok-v2-latest.js` request to look for. After it loads, `window.storyblokRegisterEvent` and `window.StoryblokBridge` exist.
- `useStoryblokBridge` only registers when `_storyblok` in the URL **equals the story id**; `input` events then call back, `change` and
  `published` reload the page.
- Trailing-slash start page URLs (`/blog/`) are redirected by Next with the query string kept.

## Testing the editor integration without the editor
Serve a parent page from another localhost port that iframes `http://localhost:3000/<page>?_storyblok=<real story id>`, allow localhost in
`frame-ancestors` in development only, and check in the frame: React hydrated (`Object.keys(document)` has `__reactContainer…`), tagged blocks
(`[data-blok-c]`), and the two bridge globals. Intercepting the response with Playwright `route.fulfill` or using an `about:blank` parent breaks
hydration (local-network-access blocking) and gives false negatives.
