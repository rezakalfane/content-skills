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
