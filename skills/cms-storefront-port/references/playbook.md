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

## 9. Recipe: port an existing single-CMS storefront to the block model
Used three times (Contentful, Storyblok, Contentstack; one commit each, "Block-composed pages: port the block model and the <CMS> provider"). The source is a finished single-CMS build of the SAME CMS (`~/Workspaces/{Storyblok,ContentStack,Contentful}/storefront`) and the switchable project `content-commerce-b2b` as the donor of the neutral code. Pages and posts become ordered block lists (see `boundary.md`).

1. **Copy the neutral tree from the donor** (`content-commerce-b2b`), not the CMS-specific parts: `app/` (catch-all `[locale]/[...slug]`, `blog`, `guides`, `products` instead of `[root]`), `components/`, `core/` (`content.ts`, `edit.ts`), `lib/` (`content.ts` facade, `request.ts`, `i18n.ts`, `catalog-route.ts`, `fonts.ts`), `providers/cms/meta.ts` and `gates.ts`. Delete what the single build replaced (`lib/blog.ts`, `lib/site.ts`, `lib/<cms>.ts`, the fixed-layout pages, the old edit helper).
2. **Reduce to one CMS.** `lib/content.ts` imports the one provider directly (`const cms = async () => provider`); `lib/request.ts` keeps only `isPreviewRequest`; `meta.ts` becomes `CMS_LABEL` + `FRAME_ANCESTORS`; `gates.ts` keeps the one gate; no switcher, no registry, no `x-cms`, no time-travel files.
3. **Swap in the provider folder** `providers/cms/<cms>/` (client, mapper, `index.ts`, edit-support, live editing/preview) from the donor, plus the CMS's gate in `gates.ts` and its proxy part: the `proxy.ts` of the single build is the donor's minus CMS resolution: locale routing, the editor-path rewrites for that CMS, a trusted `x-preview` set only after the gate (client copy deleted), and `frame-ancestors` for that CMS (plus localhost in development).
4. **`tools/<cms>/`**: the seeding scripts from the donor (`schemas`, `seed`, `blocks`, `content*`, `photos`, editor config) plus `backup.py` (JSON of types/components and every entry or story in full, written to `.backups/`, gitignored) and a prune step that is a **dry run by default** (lists what would go; `--run` for `tools/contentstack/prune.py`, `--prune` for `schemas.py` of Contentful and Storyblok). Add `.backups/` to `.gitignore`.
5. **`next.config.ts`: `images` only** (the CMS asset host and BigCommerce). No CSP, no headers there: the CSP is set in `proxy.ts`.
6. **Deploy order** (the old site and the new code share one space, so nothing may be removed first):
   1. additive model change + seed the new fields (the old site keeps working);
   2. deploy the code that reads the new fields (merge, wait for the Vercel build);
   3. publish the content to **every environment the deployed sites read** (Contentstack: production AND preview; if a publishing rule needs a workflow stage, re-approve the entries first);
   4. verify both sites (`scripts/urltest.py`, text parity below);
   5. `backup.py`;
   6. prune (dry run, read the list, then run it); reseed anything that still writes old fields before pruning.
7. **Text parity against the switchable site**, per page and language: fetch the same path from both sites (the switchable one with the `cms` cookie of that CMS, `curl -b cms=<id>`), strip tags and compare the text, e.g.
   `curl -s -b cms=storyblok "$SW/fr/guides" | python3 -c 'import sys,re,html;print("\n".join(l.strip() for l in html.unescape(re.sub(r"<script.*?</script>|<style.*?</style>|<[^>]+>","\n",sys.stdin.read(),flags=re.S)).splitlines() if l.strip()))' > a.txt`, the same for the port, then `diff a.txt b.txt`. Published reads are cached 60 s: reload twice after a reseed. Lazy images make pixel diffs noisy; text is the reliable check.
8. **Commit author for a private repo**: set the repo-local `user.email` to the GitHub noreply address (`<id>+<login>@users.noreply.github.com`, id from `gh api user -q .id`), otherwise Vercel blocks the production deployment. Push, then **wait for the Vercel git integration** to build (poll `vercel ls` / the deployment status; do not trigger a second deploy), and only then run the verification and the prune.
9. Docs and HISTORY: one entry for the port, one for the prune with a **Lesson** line (the publish-to-every-environment rule came from a Contentstack site that stayed empty after a reseed).
