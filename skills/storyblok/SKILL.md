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
