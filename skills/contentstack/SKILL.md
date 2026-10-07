---
name: contentstack
description: >-
  Build and operate Contentstack-powered sites and manage a stack through the
  Content Management API (CMA) and Content Delivery SDK. Use whenever the user
  mentions Contentstack, a stack, content types, entries, assets, locales,
  environments, publishing, workflows or publishing rules, Live Preview, Visual
  Editor, delivery/preview/management tokens, or wants a storefront, blog or
  site that reads from Contentstack (Next.js especially), seeds or localizes
  content, or sets up a review-before-live gate. Also use for Contentstack API
  errors (api_key is not valid, insufficient permissions, reference errors).
---

# Contentstack

Distilled from building a bilingual Next.js 16 storefront on a Contentstack EU stack (content) and BigCommerce (catalog),
with seeded content, Live Preview, Visual Editor and an approval gate. Read the reference that matches the task:

| Task | Read |
|---|---|
| Call the CMA: content types, entries, assets, publish, localize | `references/cma.md` |
| Read content in an app: SDK, tokens, environments, references, caching | `references/delivery.md` |
| Live Preview, Visual Editor, edit tags, per-locale base URLs | `references/live-preview.md` |
| Locales, fallback, localized entries and URLs | `references/localization.md` |
| Environments, workflows, publishing rules, staging site, releases | `references/workflow.md` |
| Seeding sample content with scripts | `references/seeding.md` |
| Something failed | `references/pitfalls.md` |

`scripts/cs_api.py` is a small, secret-safe CMA client (stdlib only). Use it instead of ad-hoc curl:

```bash
python3 scripts/cs_api.py GET /environments
python3 scripts/cs_api.py GET /content_types --params limit=100 include_count=true
python3 scripts/cs_api.py POST /content_types/faq/entries --data @entry.json --params locale=en-us
```

## Credentials: non-negotiable

- Credentials live only in a gitignored `.env.local` (names in a committed `.env.example`; make sure `.gitignore` does not
  swallow it: `.env*` then `!.env.example`). Variables: `CONTENTSTACK_API_KEY`, `CONTENTSTACK_DELIVERY_TOKEN`,
  `CONTENTSTACK_PREVIEW_TOKEN`, `CONTENTSTACK_ENVIRONMENT`, `CONTENTSTACK_REGION`, `CONTENTSTACK_MANAGEMENT_TOKEN`
  (scripts only).
- **Never read, print or echo `.env*` contents or tokens**; the client script loads them itself and redacts them. Never ask
  the user to paste tokens into chat. If they do, say it is now exposed, use it for the session only, and suggest rotating.
- To get a secret somewhere (Vercel, CI), have the user save it to a local file outside the repo, pipe it with
  `printf '%s' "$VALUE" | vercel env add NAME production --sensitive`, then delete the file.
- The **management token never goes to a hosting provider or the browser**. Only delivery/preview tokens are runtime secrets.
- **Delivery and preview tokens can only be created in the app** (Settings → Tokens). A management token gets
  "insufficient permissions". Ask the user to create them, bound to the right environment, with *Create Preview Token* on.
- Before any public push, scan files for token/API-key values, and keep store identifiers out of public repos.

## Working rules

1. **Identify the region first.** Hosts differ: `api.contentstack.io` (US), `eu-api.contentstack.com`, `au-api…`,
   `azure-na-api…`, `azure-eu-api…`, `gcp-na-api…`; CDN `cdn.contentstack.io` / `eu-cdn.contentstack.com`; app
   `app.contentstack.com` / `eu-app.contentstack.com`. The wrong host answers *"api_key is not valid"*.
2. **Read before write.** List content types and entries, show counts, then change. Make scripts idempotent (look up by
   title/UID/filename, reuse, update in place).
3. **Check plan limits** (the free plan caps a stack at 10 content types). Do not delete the user's own types to make room;
   propose which to merge or drop.
4. **Publishing is per environment and per locale.** Content nobody published to an environment is invisible to that
   environment's delivery token. After creating or changing content, publish it where the site reads it.
5. **Verify visually and by API**: fetch the delivered entry, load the page in both locales, check images load.
6. State which environment a command targets before publishing, and never publish to production without the user's go-ahead
   when a gate exists.

## Block pages and the switchable project (verified)
- **Block-composed pages with modular blocks**: add a `components` field (`data_type: "blocks"`, `multiple: true`, each block `{title, uid, schema:[...]}`) to `page` with blocks `hero` (title, description, image, second_image, cta link, variant), `feature`, `text` (JSON RTE), `image`, `video` and `collection` (kind select, title, labels, `items` = reference to faq / buying_guide / product_spotlight / blog_landing_page); posts get a `content` blocks field (text/image/video) and `read_time`. A content type PUT must contain the whole schema (GET, append, PUT). Entry data nests under the block uid: `components: [{hero: {...}}, {text: {...}}]`. Localized entries (fr-fr) need the whole blocks field again, with references and asset uids (normalize GET's asset objects to bare uids).
- **Duplicate RTE uids are rejected** ("The current entry contains duplicate UIDs for JSON RTE fields"): when copying a post `body` into a block, regenerate every `uid` of the document.
- **Environment limit**: creating a 4th environment returned `HTTP 422 error_code 133 "Max environments limit reached for your organization"` (this plan allows 3: preview, local, production). Do not delete one to work around it; reuse an existing environment and its tokens, or ask. Live Preview base URLs are set per environment and per locale (Settings > Environments), so a new site that needs its own base URL needs its own environment.
- **Live Preview parameters in a switchable app**: the proxy verifies `live_preview` and passes `live_preview`, `content_type_uid`, `entry_uid`, `preview_timestamp`, `release_id` as trusted request headers (deleting any sent by the client); the data layer builds a per-request stack (`livePreviewQuery` mutates the stack) against `<region>-rest-preview.contentstack.com`. A stale or fake hash returns `error_code 382` ("tracker invalid"): fall back to published content instead of failing the page. `addEditableTags(entry, contentType, true, locale)` adds `$` to every nested object: for a block field the path is `page.<uid>.<locale>.components.0.hero.title`, so tag a canonical field with `block.$[<field uid>]`.
- **Joining collections**: references inside blocks come as `{uid, _content_type_uid}`; fetch each referenced type once per request (React `cache()` keyed by locale and a JSON string of the preview params) and join by uid, rather than resolving deep reference paths. List order is not creation order by default: `orderByAscending("created_at")` for guides, spotlights and announcements.
- **Pointing Live Preview at a new site without a new environment**: `PUT /v3/environments/<name>` with `{"environment": {"name", "servers", "urls": [{"locale": "en-us", "url": <site>}, {"locale": "fr-fr", "url": <site>/fr}], "deploy_content"}}` repoints the base URLs of an existing environment (French under `/fr`, so the French editor opens the French page). Save the old values first (GET /environments).
- **Load the Live Preview SDK on the first request of the pane, not only when the draft hash is present**: the pane first loads the page WITHOUT `live_preview`; the SDK (`ContentstackLivePreview.init({ssr: true, ...})`) is what tells the editor to send the draft and reloads the iframe with the hash. Gating the SDK on `live_preview` means edits and reordering never reach the preview. In a switchable app, load it for any request framed by the Contentstack app (`Sec-Fetch-Dest: iframe` + `Referer`). A text grep for the client component works in dev but not on a production build (minified chunk names): compare response sizes instead.
- **What editors see**: top-level fields of a `page` entry that the template does not draw (title, description are metadata only) do not change the pane; edit the block fields under `components`.

## Publishing after a seed script
- Seed scripts that edit entries leave them unpublished on every environment but the one they publish to, and reset them to the first workflow stage. A site reading `production` then serves the old published version (here: pages without their blocks, so an empty home page). After a content-model change, publish the changed entries to **every** environment the deployed sites read; if a publishing rule requires the Approved stage, move them there first (422 "workflow stage requirements specified by the Publish Rule").
- Deploy order for a model change: code that reads the new fields, content published to all environments, verify, backup, then prune the old fields.
- **Backup and prune tools** (`tools/contentstack/`): `backup.py` saves every content type and the entries of both locales to the gitignored `.backups/contentstack-<timestamp>.json`; `prune.py` is a **dry run by default** (prints the fields it would remove from `page` and `blog_landing_page` and the types `blog_listing_page` and `hero_banner` with their entry counts) and only changes the stack with `--run`. Run `backup.py`, then `prune.py`, read the list, then `prune.py --run`, and only after the deploy order above.
