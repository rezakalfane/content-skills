# Switcher UX, capabilities, parity, what was hard

## The settings panel (`components/cms-switcher.tsx`)
- A fixed icon (top right) opening a dialog with a radio per CMS and a list of what the highlighted CMS offers (`Capabilities` labels, struck through when absent) and a link to its editor.
- **Optimistic pick**: the selected radio is kept in local state keyed `{from: active, id}` and shown at once; it is dropped when `active` changes (the server confirmed) or when `setCms` returns false. A controlled input without it snaps back until the server answers.
- **Switching** = `await setCms(id)` (cookie only) then `router.refresh()` from the client, inside `useTransition`. Never `refresh()` inside the server action (it renders with the old cookie: two clicks needed).
- **Hover preview**: pointing at or focusing an option (`peek`) shows that CMS's capabilities ("not selected") so the CMSs can be compared before choosing; leaving restores the current choice; Escape and outside click close.
- **Hidden inside editors**: the layout renders it only when `demoSwitcherEnabled() && !(await inEditor())`. `x-editor` is set by the proxy for editor parameters or an iframe of the CMS's app, so the panel never sits on top of the preview pane. It also is off in Production unless `DEMO_SWITCHER=1` (`0` forces off everywhere).
- `setCms` re-checks `demoSwitcherEnabled()` and `isReadyCms(id)` server side.

## Per-CMS capability modules
Features that only one CMS has live in that provider's folder and are guarded by the active CMS: time travel (Amplience only: `?time=`, `amp_vse`, timeline preload in the Runtime Cache, `/api/warm`, banner and instant variants; production ignores it; see `amplience/references/time-travel.md`), the `/preview` visualization route, scheduling slots (`hero-slot`), Contentful's and Storyblok's live-edit overlays and server actions, Contentstack's Live Preview SDK (loaded for any request framed by its app, not only with `live_preview`). Pages call data getters with an optional `at`; providers without `timeTravel` ignore it, and `TimeVariants` renders `render()` once when there is no time preview.

## Parity testing
1. **Seed the same content** into every CMS, with the same shortened descriptions; check counts through each delivery API.
2. **Text diff** (reliable): request the same path with the cookie of each CMS, strip scripts/styles/tags, compare line by line: `curl -s -b cms=<id> "$SITE/fr/guides"`. Do it for home, faq, guides, blog, a post, a guide, in English and French. Storyblok and Contentful matched Amplience exactly once seeds were aligned.
3. **Pixel diff** (second): Playwright with the `cms` cookie set per context, hide fixed overlays (the switcher), scroll to trigger lazy images, full-page screenshots, compare. Lazy images and 60 s caches cause false diffs; wait and reload twice.
4. **Editor tests**: a cross-origin iframe harness (`cms-storefront-port/scripts/editor_iframe_test.mjs`) for hydration, tags and bridge; state plainly what was not tried in the real editor.

## What was hard
- A preview pane's first request has no parameter and no cookie: solved by the iframe/Referer rule plus the CSP union (and Contentstack's SDK loaded on that first request).
- Cookies in frames: `SameSite=None; Secure` needs https even in development; Amplience's partitioned cookie is only deleted with identical attributes.
- Switching with a server action: two clicks until the cookie was stored by the action and the refresh moved to the client.
- Per-CMS rate limits and plan limits (Amplience VSE 7 req/s; Contentstack 3 environments; Contentful 25 content types, hence one generic `collectionBlock`): never delete another resource to make room.
- The same model in four CMSs: heroes as slots in Amplience, inline blocks in Storyblok, links to block entries in Contentful, modular blocks in Contentstack; all mapped to one `Block` union.
- Migrating live models without downtime: deploy order readers, publish everywhere, verify, backup, prune (see `cms-storefront-port`).
- Trusting headers: every header the app reads is deleted from the client request first.
