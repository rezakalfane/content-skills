# The proxy (`proxy.ts`)

## Resolution order (first match wins)
1. **Editor parameters with signature gates.** For each ready CMS (declaration order) whose `editorParams` are present in the query (Amplience `vse`/`time`, Contentful `cf_preview`, Storyblok `_storyblok`, Contentstack `live_preview`): an editor always lands on its own CMS. Amplience's parameters only count on a preview deployment (`editorParamsApply`). The same params then go through `previewGate(cms, params)`, which decides `x-preview`:
   - Contentful: `cf_preview` equals `CONTENTFUL_PREVIEW_SECRET` (constant-time compare);
   - Storyblok: `_storyblok_tk[space_id|timestamp|token]`: space matches, timestamp within an hour, token = sha1 of `space:previewToken:timestamp`;
   - Contentstack: a non-empty `live_preview` (the preview token never leaves the server; a fake hash only makes the CMS answer error 382, handled by falling back to published);
   - Amplience: no gate (drafts are the host, not a flag);
   - in local development the flag alone is enough. A bare flag never unlocks drafts in production.
2. **Iframe framed by a CMS's app.** `Sec-Fetch-Dest: iframe` and the `Referer` origin matching a ready CMS's `frameAncestors` (Amplience excluded). Needed because a preview pane's first request can carry no editor parameter and no cookie (Contentstack Live Preview; third-party cookies are blocked in frames).
3. **The `cms` cookie**, set by the settings panel (or by step 1/2, below).
4. **`DEFAULT_CMS`.**
Special case: `/preview` (Amplience visualizations) is always Amplience and skips locale routing.

## Trusted headers
The proxy copies the request headers, **deletes** `x-cms`, `x-preview`, `x-editor` and the Contentstack `x-cs-*` set, then sets them from its own decisions (`x-cs-*` come from the verified Live Preview parameters). The app only ever reads these. A client-sent `x-preview: 1` therefore does nothing.

## CSP `frame-ancestors`: the union
`'self'` + the `frameAncestors` of every ready CMS (+ `http(s)://localhost:*` in development only). Not chosen per request: a preview pane's first request cannot say which CMS it is for, and a per-request value picked from the editor parameters blocks it ("refused to connect"). Response also carries `X-Content-Environment` (production or preview).

## Cookies in frames
When a request arrives from an editor (its parameters, or framed by its app) and the cookie differs, the proxy stores `cms=<id>` for 30 days: `SameSite=None; Secure` on https (a cross-site frame needs it), `Lax` on plain http (local development: the editor needs `https://localhost`). The settings panel's cookie (`setCms`) is `Lax`, first-party. Amplience's `amp_vse` is `Secure; SameSite=None; Partitioned`, cleared only with the same attributes plus `maxAge: 0`.

## Also in the proxy
Locale routing (English clean URLs rewritten to `/en`, `/en/...` 308 to clean, French under `/fr`); translated catalog roots (`/fr/produits`) rewritten onto `/products` with an `x-catalog-root` header; `/home` and `/fr/home` serve the home page (editors' preview URLs); Storyblok editor paths (`/pages/<key>`, `/faqs/...`) rewritten only for `_storyblok` requests (never set a "real path" in Storyblok: it drops the language prefix); Amplience session parameters (`?vse=`, `?time=`) applied to a cookie then redirected 307 to the clean URL (Server Actions are posted to the current URL and would re-apply an old parameter).
