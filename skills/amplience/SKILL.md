---
name: amplience
description: >-
  Build demos and storefronts on Amplience Dynamic Content (CMS, Content Hub DAM, virtual staging): create content type schemas
  and content types, localized content, assets and delivery keys through the Management API and the GraphQL asset API with a personal
  access token; read content with the Delivery API from Next.js (Production CDN vs Preview virtual staging on Vercel); build a Page
  that stacks components; visualizations (Preview and real-time preview with dc-visualization-sdk); slots, events, editions and
  snapshots for scheduling; preview applications; content type cards; and the "time travel" preview with a preloaded timeline. Use
  whenever the user mentions Amplience, Dynamic Content, a hub, content repository, delivery key, slot, edition, VSE or virtual
  staging, visualization, content type schema, dc-cli, or wants to redo an Amplience demo (ContentStack-style storefront on
  Amplience). Also for Amplience errors (429, EDITION_SLOT_*, "Content item name cannot be null", Invalid Snapshot Id).
---

# Amplience

Distilled from building a bilingual Next.js 16 B2B storefront on Amplience (content) + BigCommerce (catalog): 21 localizable content types, a Page that
stacks components, delivery keys as URLs, Production/Preview on Vercel, real-time preview, scheduled hero editions, content type cards and a time travel
preview. Everything below was run against a real hub. Read the reference that matches the task:

| Task | Read |
|---|---|
| Redo a whole demo (order of work, what to ask, how to verify) | `references/playbook.md` |
| REST + GraphQL calls: schemas, types, items, publish, assets, hub settings | `references/management-api.md` |
| Writing schemas, localization, the Page pattern, slots | `references/schemas.md` |
| Reading content: hosts, Production vs Preview, Filter API, limits, images | `references/delivery.md` |
| Visualizations, real-time preview, preview applications | `references/preview.md` |
| Slots, events, editions, snapshots, edition names | `references/scheduling.md` |
| Time travel UI (timeline, instant switching, blink, zoom) | `references/time-travel.md` |
| Content type cards | `references/cards.md` |
| Vercel project, env scopes, git identity | `references/vercel.md` |
| Something failed | `references/pitfalls.md` |

## Toolkit (`scripts/`, stdlib Python, run from the project directory)

| Script | Does |
|---|---|
| `amp.py` | client + **discovery by name** (hub, repos, folder path, asset folder as global ids) cached in `.amplience-ids.json`; `python3 amp.py` prints them |
| `schema_kit.py` | helpers to write schemas in Python (`lstr`, `link`, `links`, `cta`, `base`) |
| `deploy_schemas.py --schemas schemas.py [--only a,b]` | create/update schemas, register + sync + assign content types |
| `assets.py` | `upload(path, name)`: temp URL, upsert by name, publish |
| `content.py` | `L()` localized values, `clink`, `ilink`, `Items` (upsert by label, publish in order) |
| `seed_skeleton.py` | starting point for a seed script |
| `visualizations.py --types a,b <site urls>` | Preview + Real-time preview on content types |
| `cards.py [cards_config.py]` (+ `cards_config.example.py`) | content type cards |
| `schedule_template.py` | event + editions + snapshots on a slot |
`templates/next/` holds the working storefront pieces (Delivery client, preview route, time travel components); see its README for what is generic.

## Rules that save hours

- **Credentials:** the PAT only in a gitignored `.env.local` (user pastes it, never in chat); the storefront needs no Amplience secret; never put the PAT in Vercel.
- **Everything idempotent:** items by label, assets by name, schemas by id/version; rerun scripts after each change. Create linked items first; publish leaves first.
- **Localize inside the item** (`{values:[{locale,value}]}` + `locale=fr-FR,en-US`), delivery key = URL path, one catch-all route renders any Page.
- **One env var** (`AMPLIENCE_DELIVERY_HOST`) switches CDN (Production) / virtual staging (Preview). `/preview` is a 404 in production.
- **VSE is rate limited (7/s, 350/min):** pace, back off on 429, share state in the Runtime Cache, run background work in `after()`.
- Verify with Playwright against localhost and the deployed staging URL, not by inspection; measure (latency, requests, stability).
- The user wanted docs, `HISTORY.md` and screenshots kept current and the repo free of any other CMS's name; commits authored as their GitHub identity.
