# Pitfalls (cross-CMS)

- **Real/static paths in the CMS editor can drop the language prefix.** (Storyblok "real path" made the French editor open the English page.) Prefer slug-based URLs + proxy
  rewrites for editor requests only.
- **`?<editor-param>=1` must not unlock drafts.** Verify the signature the editor adds; only skip in development.
- **Hydration test harnesses**: an `about:blank` parent or Playwright `route.fulfill` interception breaks hydration (false negatives). Use a localhost parent on another port with
  localhost allowed in `frame-ancestors` in development only.
- **Stale `.next` after moving route folders**: `rm -rf .next && npx next typegen` (symptoms: `PageProps` not found, validator errors).
- **Locale-level catch-all routes** shadow or are shadowed by `[root]`; check `app/[locale]/[...slug]` before adding dynamic segments.
- **CMS number/date/list quirks** differ (Storyblok: numbers as strings, lists as text). Normalize in the mapper, not in the pages.
- **Relations**: resolve one level; fetch shared lookups (authors) once per request; handle both unresolved ids and resolved objects (live-edit updates).
- **Wrap fetchers in React `cache()`** so `generateMetadata`, page and layout share a fetch (and one-shot live-edit caches are consumed once).
- **BigCommerce errors become 404s** in the catalog pages (transient errors seen once after a deploy): a single retry in `gql()` would harden it.
- **Shell**: macOS BSD `sed -i ''` rejects multi-expression bracket edits (use Python); zsh globs `?` in URLs (quote them); foreground `sleep` is blocked (use `until` loops, with a
  cap); `vercel git connect` can outlive a short timeout; curl without `-L` to see redirect codes (308 permanent from `permanentRedirect`).
- **Playwright**: not in the project; install in the scratchpad (`npm install playwright`), browsers are cached under `~/Library/Caches/ms-playwright`.
- **Permissions**: public repo creation and pushes to other repos may be classified as outward-facing; explain and let the user decide. A transient classifier error: retry once as-is.
- **Content links written into CMS rich text** (`/fr/products`) outlive route changes; the redirect covers them, but fix the seed data too.
- **Tokens**: the browser address bar and quickstart screens show ids/tokens; mask or avoid screenshots of them.
- **Editor locale switching can be a paid feature** (Contentful: Premium). Check early whether the editor can open the French page at all on the user's plan; if not, agree on using the site's own language switcher inside the preview, with edit tags that carry the locale.
- **Editor SDKs may throw outside their host** (Contentful Live Preview: "current origin is not supported"): guard the init so the page still renders, and allow the test parent origin in development only.
- **SDK event gating**: read the SDK source for what enables an event (Contentful `save` needs `enableLiveUpdates: true`); an event that never fires looks like a refresh bug.
- **A 403 on creating a locale/type with an admin token is a plan limit**; stop and ask, do not retry or work around.
- **Deferred scope check**: before promising a content-driven feature (SKU to variant), check the data it needs exists (here 0 of 150 products had variants and the PDP had no option picker).
- **Server actions are serialised by Next**: a live-edit loop of "action, then `router.refresh()`" queues up and feels slow on a deployed site. Call `refresh()` from `next/cache` inside the action (one round trip), keep one request in flight, coalesce per entity and debounce; cache draft CMS responses for a few seconds.
- **Optimistic UI that falls back to props**: the cart subtotal flashed new, old, new because the optimistic value was dropped as soon as the save ended while the props were still stale. Keep the optimistic value until fresh props arrive (a `synced` flag). Reproduce flashes by recording the element's text with a `MutationObserver` in Playwright.
- **Check every repo has its staging sync workflow** (Amplience did not and its `staging` branch drifted three commits behind): `git rev-list --left-right --count origin/main...origin/staging` shows 0 on the right when staging is a plain ancestor, then a fast-forward is safe.
- **Fixes found in one project belong in all four**: after fixing shared UI (cart), diff the file against the other repos (they were byte-identical), copy it, type-check, and port the docs/history entry too.
- **Private repos and Vercel**: a production deployment is blocked when the commit author's email is not linked to a GitHub account that can access the repo ("couldn't find a Git account for the commit author"); use the account's noreply email as the repo-local author.
- **One model for every CMS**: pages and posts as ordered block lists (the Amplience model) let editors reorder components in every CMS; the fixed-layout versions need a developer for that. The switchable project (`content-commerce-b2b`: core/ contract, providers/cms/<id>, proxy resolving the CMS per request, settings panel) is the reference for new CMSs; a single-CMS repo is that project minus the other providers, the switcher and the time-travel modules.
- **Migrate a shared CMS model in steps** (additive, deploy readers, back up, reseed, prune): see the Contentful skill.
