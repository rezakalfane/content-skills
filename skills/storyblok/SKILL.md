---
name: storyblok
description: >-
  Build and operate Storyblok-powered storefronts and sites: model content (components, content types, folders, languages),
  seed stories and assets through the Management API with a personal access token, read content with the Content Delivery API
  (preview vs public tokens, draft vs published, relations, language) from Next.js with @storyblok/react, and the Visual Editor.
  Use whenever the user mentions Storyblok, a space, components/bloks, stories, folders, a space ID or region, the Management or
  Content Delivery API, the Visual Editor/bridge, field-level translation (__i18n__), or wants to redo a ContentStack/Amplience-style
  storefront on Storyblok. Also for Storyblok errors (422 "must be a string with numbers", 429, protocol-relative asset URLs).
---

# Storyblok

Distilled from porting a bilingual Next.js 16 B2B storefront (same pages as the ContentStack and Amplience versions, BigCommerce
for the catalog) to a Storyblok EU space. Read the reference that matches the task:

| Task | Read |
|---|---|
| How Storyblok differs from ContentStack and Amplience (mental model, mapping of concepts) | `references/differences.md` |
| Management API: components, folders, stories, assets, languages, rich text | `references/mapi.md` |
| Content Delivery API: tokens, draft vs published, relations, language | `references/delivery.md` |
| Next.js: data layer, signed preview URL, edit attributes, live editing | `references/nextjs.md` |
| Seeding a whole demo (order, idempotency, translations) | `references/seeding.md` |
| Something failed | `references/pitfalls.md` |

`scripts/sb_api.py` is a small secret-safe Management API client (stdlib only). Use it instead of ad-hoc curl:

```bash
python3 scripts/sb_api.py GET /components
python3 scripts/sb_api.py GET /stories --params with_slug=home
python3 scripts/sb_api.py PUT /stories/123 --data @story.json
```

## Credentials: non-negotiable

- Live only in a gitignored `.env.local` (names in a committed `.env.example`). Variables: `STORYBLOK_SPACE_ID`,
  `STORYBLOK_REGION` (`eu|us|ca|ap|cn`, any case; lower-case it), `STORYBLOK_PREVIEW_TOKEN`, `STORYBLOK_PUBLIC_TOKEN`
  (optional), `STORYBLOK_OAUTH_TOKEN` (personal access token, scripts only).
- **Never read, print or echo `.env*` or tokens**; scripts load them and redact them. Never ask the user to paste tokens.
- The **personal access token (Management API) never goes to a hosting provider or the browser**. Only the preview/public
  access tokens are runtime secrets. Access tokens (preview/public/asset/theme) are created in the app
  (Settings → Access Tokens); the personal access token under My Account → Account Settings.
- To get a secret into Vercel, pipe it from `.env.local` without printing: `grep ^NAME= .env.local | cut -d= -f2- | vercel env add NAME <env> --sensitive`.
- Before any public push, grep the tree for each value in `.env.local` (this found nothing in the first project).

## Working rules

1. **Identify the region first.** Management API hosts: EU `mapi.storyblok.com`, US `api-us.storyblok.com`, CA
   `api-ca.storyblok.com`, AP `api-ap.storyblok.com`, all `/v1/spaces/<id>/…`. Content Delivery: EU `api.storyblok.com/v2/cdn`.
2. **Read before write.** List components and stories first; make scripts idempotent (look up by slug / file name, update in place).
3. **Stories are published by sending `publish: 1`** on create/update. There are no environments: draft vs published is a
   version of the same story, chosen at read time.
4. **Rate limit ≈ 3 requests/s** on the Management API: sleep ~0.35 s between calls and retry on 429. A 76-story + 62-asset
   load takes about 5 minutes.
5. **Verify by API**: fetch with `version=draft` and `version=published`, in the default language and `language=fr`.

## Block pages and the switchable project (verified)
- **Block-composed pages**: a `page` story holds `components`, a `bloks` field restricted to `hero_banner`, `feature_block`, `text_block`, `image_block`, `video_block` and one generic `collection_block` (`kind` option: categories, spotlights, guides, posts, postListing, guideListing, faqs; `items` = `options` field over internal stories with `filter_content_type` listing several types). Blocks are INLINE in the story (no separate entries), so ordering is native. Posts get a `content` bloks field (text/image/video) and `read_time`. Add the new components and fields additively (a component PUT must contain every existing field).
- **Where the new pages live**: a `pages/` folder (default root type `page`) with `home`, `faq`, `guides`, `blog`; the fixed-layout stories (`home`, `faq`, blog start page of another type) stay for the old site. The app maps page key `faq` to `pages/faq`.
- **Delivery API**: relations come back as uuids plus a `rels` list of the related stories when `resolve_relations=component.field,...` is given; resolve them yourself (uuid to story) rather than depending on a client library. `per_page` is only valid on list requests: sending it to `cdn/stories/<slug>` returns **422**. `language=fr` merges `field__i18n__fr`; the bridge's unsaved story carries every language next to the default value, so apply `__i18n__<lang>` yourself for live edits.
- **Visual Editor bridge**: `registerStoryblokBridge(id, cb, {resolveRelations})` (from `@storyblok/js`, after `loadStoryblokBridge()`) only registers when `id` equals the `_storyblok` URL parameter, i.e. the story open in the editor; it sends the WHOLE unsaved story on every `input` (typing, reordering, adding blocks) and reloads the page on `change`/`published`. Send the story to a server action (verify the signed `_storyblok_tk[...]` URL parameters with the same gate as the page), keep it in memory for a few minutes, apply it to draft reads, then `refresh()` from `next/cache`. Edit tags are block-level (`data-blok-c` JSON with the story id and the block uid, `data-blok-uid`), the same attributes for every field name.
- **Editor URLs**: the editor opens `<environment URL><story slug>` (French: `fr/<slug>`): serve `/pages/<key>`, `/faqs/..`, `/authors/..`, `/spotlights/..`, `/settings/..` from the proxy for requests carrying `_storyblok` only (home maps to `/`). Never set a "real path" on stories (it drops the language prefix). Environments (production, staging, local https) are added by merging into `space.environments`, keeping the ones other sites use.
- **Testing without the editor**: the bridge protocol is minified; expose a development-only hook that calls the same handler the bridge uses and drive it from a Playwright iframe harness (parent on another localhost port); verify tags, the editor path rewrite, a swap of the first two components, and a typed title.
- **Pruning a Storyblok space after a model change**: back up first (components + every story read in full, since the story list has no content); reseed the stories in the final model (a story PUT replaces `content`, so old values leave it); remove old fields by PUTting the components without them (this hides them in the editor; values stay in stories until they are re-saved, hence the reseed); delete a removed component by first deleting its stories (`GET /stories?contain_component=<name>`, `DELETE /stories/<id>`) then `DELETE /components/<id>`; stories of a type that STAYS (the old fixed-layout `home`, `faq`, folder start pages of type `page`) are not touched by a component prune: delete them explicitly (they have the old `hero` field and no `components`).
- **Final prune workflow in a single-CMS repo** (`tools/storyblok/`): readers deployed, stories published, both sites verified, then `python3 tools/storyblok/backup.py` (components and every story in full, to the gitignored `.backups/`), reseed posts and pages in the final model (`seed.py --only posts,pages`), then `python3 tools/storyblok/schemas.py --prune`. Without `--prune` it lists the components and superseded stories that would go (with story counts); with it, removed components, their stories and the old fixed-layout stories are deleted. Check the 26 URL checks on production and staging afterwards.
