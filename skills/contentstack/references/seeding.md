# Seeding content with scripts

Pattern that worked (Python, stdlib + Pillow for images):

- `seed.py` helper: region-aware host table, `.env.local` loader, `api()` that redacts secrets and exits with a clean message
  on HTTP errors, `upload_asset()`, `ensure_entry()` that looks up by title and updates in place.
- Run order: `schemas.py` (content types) → `seed.py` (authors, posts) → `seed_extra.py` (FAQs, guides, banners, navigation,
  pages) → `seed_fr.py` (localize everything) → `workflow.py` (gate) → `publish_environment.py <env> [--approve]`.
- Idempotent everywhere: assets by filename (replace in place), entries by title, rules/workflows by name.
- Dependency order for references; blog "related posts" only reference earlier posts.
- Images: use real photos (no text baked in); crop to a consistent ratio; generate alt text. Do not hot-link; upload to assets.
- Keep copy fictional unless told otherwise (placeholder authors, `example.com`), and say so in the docs.
- `publish_environment.py`: assets first, then entries in dependency order, each locale with top-level `locale`; collect
  failures and exit non-zero.
