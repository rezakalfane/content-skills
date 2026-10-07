# Seeding a demo space

Layout used in the storefront repo (`scripts/seed/`): `sb.py` (Management API helper + upload + upsert + richtext), `schemas.py`
(components + languages), `images.py`, `seed.py` (all content, EN + FR in one pass), content data files, `photos/`.

1. **Schemas first** (`schemas.py`): add the language, create/update components. Delete blueprint leftovers only after the home story is rewritten.
2. **Folders** with `default_root` set to the type they hold.
3. **Dependency order**: authors, FAQs → posts (a post's `related_post` points to an *earlier* post so its UUID already exists) →
   listing page (start page) → guides → spotlights → settings → pages.
4. **One write per story** with both languages (`tr(content, "title", en, fr)` sets `title` and `title__i18n__fr`), `publish: 1`.
5. **Idempotent**: assets by file name, stories by `with_slug`.
6. Stringify numbers; dates as `YYYY-MM-DD HH:mm`; convert simple HTML (`<p>`, `<a>`) to richtext documents.
7. Verify: counts per `content.component` through the delivery API (`version=draft`), `language=fr`, and a `version=published` read.
