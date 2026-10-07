# Preview, real-time preview and preview applications

Docs: https://amplience.com/developers/docs/dev-tools/guides-tutorials/visualizations/ . Visualizations are per content type; preview applications are hub-level.

## Visualizations (content form + iframe)
`settings.visualizations[] = {label, templatedUri, default}` on the content type (`scripts/visualizations.py` sets them). Template tokens:
`{{content.sys.id}}`, `{{vse.domain}}`, `{{hub.name}}`, `{{locales}}`, `{{delivery.key}}`, `{{snapshot.id}}`. Add **`&realtime=true`** for real-time.
Build one route in the storefront: `/preview?id={{content.sys.id}}&vse={{vse.domain}}&locales={{locales}}[&realtime=true]` (`templates/next/app/preview/*`):
1. Validate input: a UUID and a host matching `/^[a-z0-9-]+\.staging\.bigcontent\.io$/` (or your configured host): never fetch arbitrary URLs.
2. Fetch `https://<vse>/content/id/<id>?depth=all&format=inlined&locale=...` and render the item with the SAME components as the live site (one rendering path).
3. Real-time: a client component runs `dc-visualization-sdk`: `init()` (race a 4 s timeout: outside Dynamic Content it never answers), `sdk.form.get({allowInvalid:true})`,
   `sdk.form.changed(cb)`, `sdk.locale.get()/changed(cb)`. Send each model (debounce ~150 ms) to a **server action** that returns the rendered tree; keep only the latest response.
4. **The form model's shape is not guaranteed**: it may be wrapped in `{content: ...}`, lack `_meta.schema` at the root, and still carry `{values:[{locale,value}]}` wrappers.
   Unwrap, fall back to the saved item's schema (pass it from the server), and resolve localized values client-side with the same fallback as the API. Print what was received when nothing matches.
5. Production must 404 the route and make the action throw. Allow framing only by Amplience: `Content-Security-Policy: frame-ancestors 'self' https://*.amplience.net`. Preview deployments must be public (no Vercel login wall).
6. Visualizations need `https` (or `http://localhost`). Register localhost too for development.

## Preview applications (Settings → Preview, hub level)
Used by Scheduling timeline / edition **date-time previews**. URL like `https://<site>/?vse={{vse.domain}}`; `vse.domain` is a virtual staging domain **frozen at the chosen
date or edition**. The app pins the whole session to it: cookie (`Secure; SameSite=None; Partitioned`, because the site is framed), then redirect to the clean URL so
Server Actions posted to that URL don't re-apply it. **These cannot be created through the API** (hub settings need the DAM secret): add them in the UI.

## Content type cards
See cards.md.
