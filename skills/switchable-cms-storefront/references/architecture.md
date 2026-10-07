# Architecture

## The contract (`core/content.ts`)
- **Content model** shared by every CMS: `Page = {title, description?, blocks: Block[]}`; `Block` is a union of 12 types (hero, text, image, video, feature, categories, spotlights, guides, posts, postListing, guideListing, faqs); `Post` has `blocks: PostBlock[]` (text, image, video); guides, FAQs, spotlights and authors are referenced by blocks. Every mapped object is `Tagged` (`$` edit attributes).
- **`ContentProvider`**: `getPage(key, locale, at?)`, `getNavigation`, `getAnnouncement(locale, audience?)`, `getPosts/getPost`, `getGuides/getGuide`, `getSpotlights`. `at` is a unix ms instant only understood by providers whose capability `timeTravel` is true; the others ignore it. A page key is `home`, `faq`, `guides`, `blog` or any page an editor adds (one catch-all route `app/[locale]/[...slug]`).
- **`Capabilities`** `{typedEditing, timeTravel, visualization, scheduling, reorderLive}` per CMS, listed in the settings panel. Today only Amplience has `timeTravel`, `visualization`, `scheduling`.

## Registry and facade
- `providers/cms/index.ts`: `loaders: Partial<Record<CmsId, () => Promise<{provider}>>>`, `loadProvider(id)` throws for an unknown or not-ready id. Lazy so a request only bundles and loads the CMS it uses. A provider's `index.ts` exports `provider` and reads `isPreviewRequest()` itself to choose draft vs published.
- `lib/content.ts` is the only thing pages import: each function awaits `activeCms()` then `loadProvider(id)` and delegates.
- `meta.ts` must stay import-light: `proxy.ts`, `next.config.ts` and the client switcher read it. `ready: false` lists a CMS in the panel as "soon" but it cannot be chosen (the proxy and `activeCms` ignore it).

## Per-request state (`lib/request.ts`)
`activeCms()` reads `x-cms`, `isPreviewRequest()` reads `x-preview === "1"`, `inEditor()` reads `x-editor === "1"`; all wrapped in React `cache()` so layout, page and `generateMetadata` share one resolution. Fallback to `DEFAULT_CMS` (env `DEFAULT_CMS`, default amplience) for an unknown value.

## Caches keyed by provider
- Each provider's fetchers are wrapped in React `cache()` inside the provider's own module, so two CMSs never share an entry; keys also include locale, draft flag and (Contentstack) a JSON string of the Live Preview parameters.
- Published reads: `next: {revalidate: 60}` per fetch (URL-keyed, so CMS-specific); drafts `no-store` or a few seconds.
- Module-level state (Contentful's and Storyblok's live-edit overlays, Amplience's rate-limit pacer and timeline plan, the Runtime Cache keys) belongs inside the provider folder. The time banner and `getTimePreview()` return nothing unless `activeCms()` is Amplience, so an `amp_vse` cookie left from earlier does not leak the banner onto another CMS.
- Published data is cached 60 s with stale-while-revalidate: after a reseed, reload twice before comparing.

## Adding a provider
1. `providers/cms/<id>/index.ts` exporting `provider`; map content into `core/content.ts`.
2. `meta.ts`: `ready: true`, `capabilities`, `frameAncestors`, `editorParams` (query parameters only that editor adds), `editorUrl`; add the `CmsId` to the union in `core/content.ts`.
3. `gates.ts`: its draft gate (signature or secret; see `proxy.md`). `index.ts`: one loader line.
4. `next.config.ts` image hosts; if it has a client SDK, a case in `components/edit-support.tsx`; editor-path rewrites in `proxy.ts` if the editor opens slugs that are not routes (Storyblok `/pages/<key>`).
5. Seed the same content (`tools/<cms>`), then run the parity checks (`switcher-and-parity.md`).
