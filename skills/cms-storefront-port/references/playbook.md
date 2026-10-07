# Playbook

## 0. Inputs from the user (never in chat)
CMS credentials in `.env.local`: read/delivery token, preview/draft token, a management/personal token for the seeding scripts, space or
project id, region/environment. BigCommerce variables are copied from the reference project. Ask what the editor experience should be
(live preview vs visual editor), languages (here EN default + FR) and the repo name `<cms>-commerce-b2b`.

## 1. Copy the base (no secrets, no history)
```bash
rsync -a --exclude node_modules --exclude .next --exclude .git --exclude .vercel --exclude .env.local --exclude .DS_Store \
  ../Storyblok/storefront/ ./storefront/
grep -E '^BIGCOMMERCE_' ../Storyblok/storefront/.env.local > storefront/.env.local   # names only on screen; never print values
git init
```
Add the new CMS variables (blank) to `.env.local` and `.env.example`. Remove the previous CMS's packages and code in step 4, not before.

## 2. Model (ask the CMS what it is first)
Recreate the content types in `boundary.md`. Decide per CMS: how localization works (field-level vs per-locale entries), how references
are stored, how lists of strings are modelled, whether heroes are blocks or entries. Write idempotent scripts under `scripts/seed/`
(client helper, schemas, seed, editor config). Reuse `content*.py`, `photos.py`, `photos/` and `images.py` from the reference.

## 3. Seed (English + French in one pass if the CMS allows)
Order: folders/types, authors, FAQs, posts (related post points to an *earlier* post), blog listing, guides, spotlights, announcements,
navigation, pages (overwrite any quickstart Home). Publish as you go. Expected counts: 6 authors, 15 FAQs, 36 posts, 1 blog listing,
6 guides, 6 spotlights, 2 announcements, 1 navigation, 3 pages, 62 images. Verify through the delivery API in default and French, and a
published read, not just the management API. Respect rate limits (sleep + retry on 429). A full load takes minutes.

## 4. Connect the storefront
Replace the data layer, keeping the shapes in `boundary.md` and the `$` edit tags. Remove the old CMS packages, `lib` files, edit
component and CSP/image hosts in `next.config.ts`. Implement: client per token type, `getEntry/getEntries`, relation resolution (one
level; fetch authors once and join), React `cache()` per request, published caching (`revalidate` 60) and draft `no-store`, language
mapping, rich text to HTML. Then `rm -rf .next && npx next typegen && npx tsc --noEmit && npx eslint .`, `npm run build`, run the dev
server and `scripts/urltest.py`.
**Preview gating:** signature check for the editor's URL parameters, as in `lib/storyblok.ts` (`previewParams`); dev can skip it.

## 5. Visual editing
Per CMS: preview URL(s) in the CMS settings (production, staging, local https), the bridge/SDK component (`EditSupport`), edit
attributes via `$`, CSP `frame-ancestors` for the CMS only (localhost allowed in development only). The editor usually requests
`<lang>/<slug>`: route `/fr/...` natively and map slugs that have no page (home, faqs, authors, settings) in `proxy.ts` for editor requests.
Test with `scripts/editor_iframe_test.mjs` (cross-origin localhost parent). Ask the user to click through the real editor in both languages
and report back.

## 6. BigCommerce content and URLs
Already in the reference code: locale directive, translated catalog URLs, switcher, redirects. Check `references/bigcommerce.md`; only the
root-segment config (`CATALOG_ROOT`) and, if the CMS has a locale-level catch-all route, the Amplience-style proxy rewrite apply.

## 7. Docs, screenshots, history
Rewrite README and the docs set for the new CMS (architecture, `<cms>.md`, `visual-editor.md`, i18n, implementation, operations, seeding,
decisions). Remove the previous CMS's screenshots, take new ones (ask the user for the CMS app screens), mask the address bar, retake any
French storefront screenshots. Append `HISTORY.md` (prompt to result). Update the CMS skill.

## 8. GitHub + Vercel (see `delivery.md`)
After the first deploy rerun the CMS's preview/editor configuration with the real production and staging origins (Contentful: `editor.py` with `PREVIEW_PRODUCTION` / `PREVIEW_STAGING`).
Public repo (after the user confirms visibility), `main` + `staging` with the sync workflow, Vercel project, env vars per scope, protection off for
previews, connect Git once the build works, verify production and staging with `urltest.py`.
