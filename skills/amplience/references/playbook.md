# Playbook: a new demo on Amplience, start to finish

This is the order that worked (Next.js storefront on Amplience content + a commerce backend, EN/FR, Production/Preview on Vercel, page builder, scheduling, previews).

0. **Ask first (once):** hub name and where the PAT goes (`.env.local`, never the chat); which locales; whether to localize existing schemas (breaking for old items) or reuse them; GitHub owner and visibility; commit identity.
   Don't ask what you can read: hub, repos, folders, schemas, locales and VSE host all come from `python3 scripts/amp.py`.
1. **Scaffold** the project (duplicate a previous demo or `create-next-app`); `.env.example` with `AMPLIENCE_HUB_NAME`, `AMPLIENCE_DELIVERY_HOST`, `AMPLIENCE_PAT`, commerce tokens; `.env.local` gitignored.
2. **Discover:** `AMPLIENCE_HUB_NAME=... AMPLIENCE_CONTENT_FOLDER="A/B" AMPLIENCE_ASSET_FOLDER="A/B" python3 scripts/amp.py` (writes `.amplience-ids.json`, gitignore it). Test the PAT: it is a bearer token for REST and GraphQL.
3. **Model** (references/schemas.md): `schemas.py` with `schema_kit` helpers: localizable text fields, a `page` that stacks components, a slot, shared building blocks (image wrapper, text, video, author). Deploy with `deploy_schemas.py --schemas schemas.py`.
4. **Content:** reuse existing demo data; copy `seed_skeleton.py`; create images first (`assets.upload`), then leaves, components, pages, then `publish_all()`. EN + FR in the same items via `L(en, fr)`.
5. **Delivery check:** `curl "https://<hub>.cdn.content.amplience.net/content/key/home?depth=all&format=inlined&locale=fr-FR,en-US"` before writing any UI.
6. **Storefront:** copy `templates/next/` (client, image loader, markdown, content mapper, block renderer, catch-all route, detail routes), route every page through delivery keys; keep detail layouts as components so previews reuse them.
7. **Preview + real-time preview:** `app/preview/*`, CSP frame-ancestors, `scripts/visualizations.py --types ... <staging url> http://localhost:3000`. Add the two Preview applications in the UI.
8. **Scheduling:** slot + editions with snapshots (`schedule_template.py`), `campaign` string on the slot schema.
9. **Time travel UI** (optional but impressive): templates + `AMPLIENCE_TIME_TOKEN` (from a preview application's domain), `maxDuration`, Runtime Cache. Read time-travel.md first.
10. **Cards:** `cards_config.py` from the example, `python3 scripts/cards.py`; render each card from a real item with Playwright to verify.
11. **Deploy:** references/vercel.md (framework preset, env scopes, public previews, git identity). Verify with `curl -sI <url> | grep -i x-content-environment` on both URLs.
12. **Docs and history:** `docs/` set (README index, architecture, amplience, visualizations, implementation, i18n, seeding, operations, decisions), `HISTORY.md` (prompt -> result, with rejected options), screenshots under `docs/images` as compressed JPEGs
    (retina PNGs are 1-2 MB each). Keep the repo free of mentions of any previous CMS if asked.

## How to verify (what worked)
- Typecheck + lint + `next build` before each push; Playwright scripts against localhost AND the deployed staging URL (swap latency, requests while sliding, stability over 40 s).
- Log DOM changes with a MutationObserver instead of guessing about flicker; count network POSTs; measure `input -> DOM updated` in `requestAnimationFrame` ticks.
- Idempotent scripts everywhere (items by label, assets by name): re-run after every schema change.
- Commit as the user's GitHub identity; force-pushes and history rewrites may be blocked: add new commits instead.
