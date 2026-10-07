# Storyblok vs ContentStack vs Amplience

| Concept | Storyblok | ContentStack | Amplience |
|---|---|---|---|
| Container | **Space** (id, region) | Stack (api key, region, branch) | Hub + content repositories |
| Content model | **Components** (`schema` of fields). A component is a *content type* (`is_root`) and/or a *block* (`is_nestable`) | Content types + global fields + modular blocks | JSON-schema content types |
| A page/article | A **story** (`content.component` says its type) in a **folder** tree; URL = `full_slug` | An entry; URL is a field (`url`) | A content item, URL via delivery key |
| Reusable pieces inside a page | **Nestable blocks** stored *inside* the story (a hero is a blok, not a separate entry) | Separate entries linked by reference (hero_banner) | Linked content items or inline |
| Links between content | `option` / `options` field over internal stories, stored as **UUIDs**; resolved with `resolve_relations` | `reference` fields, `include_reference` | content links, `_meta` + hierarchies |
| Languages | **Field-level** (default) : one story, translatable fields get `field__i18n__fr`; or folder-level (`/fr/…` copies) | **Localized entries**, one per locale, with fallback | Localized fields in one item (localization) |
| Draft / live | Same story, **draft vs published version**; `publish: 1` on write | Per **environment** and per locale publish | Publishing + **virtual staging** (VSE) vs production CDN |
| Environments | None. The token type picks the version: **public** token = published only, **preview** token = draft + published | Delivery token bound to an environment | Production hostname vs staging hostname |
| Folder start page | A folder can have a root story (`is_startpage`), served at the folder URL (`blog` → `blog/`) | n/a | n/a |
| Read API | Content Delivery API v2 (`/cdn/stories`), plain JSON + `rels` | Delivery SDK, GraphQL | Delivery API + GraphQL |
| Write API | Management API (personal access token, 3 req/s) | CMA (management token) | Management API (PAT/OAuth) |
| Rich text | JSON (TipTap-like: `doc`, `paragraph`, `heading`, `bullet_list`, `list_item`, `text` + `marks`) rendered with `renderRichText` | JSON RTE or HTML RTE | Markdown/HTML fields |
| Visual editing | **Visual Editor**: preview URL in space settings, the Storyblok **bridge** in the page, `storyblokEditable` / `_editable` | Live Preview + Visual Builder (`data-cslp`) | Visualizations (dc-visualization-sdk) |

## What changes when porting a ContentStack storefront

- **Entry references become blocks or stories.** Things that were referenced entries *only to be reused once* (hero banner per page)
  become a nestable block inside the page. Things really shared (authors, FAQs, posts) stay stories and are linked by UUID.
- **Locale entries disappear.** One story carries both languages; the seeding script writes `title` and `title__i18n__fr` together.
- **Link fields {title, href}** have no equivalent worth using for storefront routes: use `cta_label` (translatable) + `cta_href`.
- **Lists of strings** have no field type: use a one-per-line textarea (split on `\n` in the app) or comma-separated text.
- **Numbers are strings** in the story JSON (`"377"`), dates are `"YYYY-MM-DD HH:mm"`.
- **No publish-per-environment gate.** The "review before live" workflow of ContentStack is a separate Storyblok feature
  (workflows / stages); it is not needed for the base port.
- **Relations are not inlined by the raw API.** The response has `rels` next to `story`; `@storyblok/react` / the JS client
  merges them in when `resolve_relations` is passed.
