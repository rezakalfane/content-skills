# Concepts and what to verify

> Verified on project 1: see 'What turned out different' in SKILL.md. Heroes/feature blocks/steps/use cases/nav links/footer columns are separate linked entries (15 content types in total); localization is per field.

| Concept | Contentful (from general knowledge; VERIFY) | Storyblok | ContentStack | Amplience |
|---|---|---|---|---|
| Container | space > environment (`master`) | space | stack | hub + repositories |
| Model | **content type** with typed fields (Symbol, Text, RichText, Integer/Number, Date, Boolean, Link to Entry/Asset, Array of Symbol or Link, Object, Location) | components | content types | JSON-schema types |
| A page/article | an **entry**; URL is a `slug` field you define | story | entry | content item |
| Reusable pieces | linked entries (no inline nestable blocks; hero/feature blocks are separate entries, or a JSON Object / rich-text embedded entry) | nestable blocks | modular blocks / references | linked items |
| Lists of strings | **Array of Symbol** field exists (checklist, key features, SKUs) | one-per-line text | repeatable text | arrays |
| Localization | per-field per-locale (`fields.title['en-US']`); a field is localized or not | field-level `__i18n__` | per-locale entries | field-level |
| Draft / published | entries have a version and are published explicitly; **CDA = published, CPA = drafts + published** | version + token | environment + token | VSE vs CDN |
| Links between entries | `{ sys: { type: 'Link', linkType: 'Entry', id } }`, resolved by `include` (depth up to 10 on read) | uuid + resolve_relations | reference + include | content links |
| Rich text | JSON document (`nodeType: 'document'`) rendered with `@contentful/rich-text-html-renderer` or `-react-renderer` | JSON | JSON/HTML | markdown/HTML |
| Write API | Content Management API: version header on update (`X-Contentful-Version`), publish as a separate call | MAPI | CMA | Management API |
| Assets | create asset with `upload` URL, **process**, then publish | signed upload | upload | Content Hub |
| Editor | Live Preview (preview URL per content type + SDK); VERIFY visual editing options | Visual Editor + bridge | Live Preview / Visual Builder | visualizations |

## Mapping decisions to make (shapes in `cms-storefront-port/references/boundary.md`)
- **Hero banner / feature block / guide step / nav link / use case**: Contentful has no inline blocks. Choose between (a) separate entries linked from the page (simplest to query; more clicks for
  editors) or (b) one `Object` JSON field (poor editing UX). Prefer (a) and name them clearly; mapping them into the existing shapes happens in `lib/site.ts`.
- **Single-entry singletons** (navigation): one entry of type `siteNavigation`; fetch by `content_type` + `limit=1` or by a known entry id.
- **Slugs/URLs**: a `slug` field per entry (localized only if translated URLs are wanted; the storefront shares slugs across languages for content pages).
- **Numbers and dates** are real types here (no string-numbers like Storyblok); dates are ISO.
- **Enums**: `Symbol` with a validation list (store English values; display mapping stays in `lib/i18n.ts`).
- **Draft previews of linked entries**: the CPA returns drafts of linked entries too; verify `include` depth and that locale fallback works as expected (`locale=fr` vs `locale=*`).

## Verify early (each of these can change the design)
1. Plan limits (content types, locales, API rate limit, entries) and whether multiple locales are allowed.
2. How fields fall back when a French value is missing (locale fallback chain configured per locale).
3. Which preview mechanism works with a Next.js App Router server-rendered page, and what the editor appends to the preview URL (entry id, locale, any signature).
4. Whether the editor opens `<preview URL template>` with `{entry.fields.slug}` and `{locale}` so French can open `/fr/...` (see the Storyblok real-path lesson in `cms-storefront-port/references/pitfalls.md`).
5. Asset URLs (`//images.ctfassets.net/...` protocol-relative) and the image transformation API (`?w=&fm=`) vs `next/image`.
