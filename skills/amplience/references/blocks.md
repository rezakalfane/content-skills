# Block model, visualization route, switchable base

Verified in `~/Workspaces/content-commerce-b2b` (`providers/cms/amplience/mapper.ts`, `core/content.ts`, `scripts/amplience/schemas.py`, `app/preview/*`, `proxy.ts`). This is the model every other CMS port was later made to match.

## Pages and posts are ordered block lists
- `page` schema: `title`, `description`, `image`, and `components` = a list of links (0 to 40) to the component schemas below, "stacked top to bottom". The delivery key is the URL path (`home`, `faq`, `guides`, `blog`, or any page an editor adds); one catch-all route renders any key.
- `blogpost` has `content` = list of links (1 to 20) to `image`, `video`, `text`, plus `readTime`; `buying-guide` and the entities (FAQ, spotlight, author) are separate items that blocks reference.
- 12 block types in the app model (`core/content.ts` `Block`), mapped from 13 schemas:

| Block type | Amplience schema | Notes |
|---|---|---|
| `hero` | `hero-banner`, or `hero-slot` | a slot holds whatever hero is scheduled live (empty when none); `slotContent[0]` is rendered and `campaign` (stored on the slot) names the stretch on the time travel timeline |
| `text` | `text` | markdown, rendered to HTML in the mapper |
| `image`, `video` | `image`, `video` | also usable inside a post's `content` |
| `feature` | `feature-block` | title, copy, image, `layout` image_left or image_right |
| `categories` | `category-tiles` | tiles come from BigCommerce, not content |
| `spotlights`, `guides`, `posts` | `spotlight-row`, `guide-row`, `post-grid` | rows of linked items (`depth=all&format=inlined` resolves them) |
| `postListing`, `guideListing` | `post-listing`, `guide-listing` | the paged listing; the items come from a Filter API query, not links |
| `faqs` | `faq-section` | linked FAQs, sorted by `sortOrder` |

- The mapper is one `switch` on the schema name; an unknown schema maps to nothing, so adding a component to the content model never breaks a page that does not know it yet.
- Create linked items first and publish leaves first (see `SKILL.md`); a slot's content is a snapshot link, so re-running `scripts/amplience/schedule.py` replaces the event.

## Visualization route `/preview`
`/preview?id={{content.sys.id}}&vse={{vse.domain}}&locales={{locales}}[&realtime=true]` (details in `preview.md`). In the switchable project:
- The route is **404 in production** (`CONTENT_ENV === "production"`), validates the id (UUID) and the host (`VSE_HOST` or the configured host), fetches `https://<vse>/content/id/<id>?depth=all&format=inlined&locale=...`, and renders with the same block components via `previewable()` (a page, a post, a guide, or a single block for any other schema).
- `proxy.ts` treats `/preview` as Amplience's: no locale routing, always `x-cms: amplience`, regardless of the cookie, so the visualization works even when another CMS is selected in the switcher.

## Being the base of the switchable project
Amplience is the provider the others were compared against (text identical, 0.0% pixel difference). It has the only `timeTravel`, `visualization` and `scheduling` capabilities. See the `switchable-cms-storefront` skill for the contract (`core/content.ts`), the registry and the proxy order; Amplience-specific parts there:
- Its editor parameters are `vse` and `time`, and they only count on a **preview deployment** (host contains `staging`): `editorParamsApply` is false in production, so a production URL with `?time=` or `?vse=` is a plain page.
- Its draft gate is always false: drafts are not a flag, they are the host (virtual staging vs CDN), chosen by `AMPLIENCE_DELIVERY_HOST`.
- Its CSP `frame-ancestors` entry is `https://*.amplience.net`; the `amp_vse` cookie is `Secure; SameSite=None; Partitioned` because the app frames the site.
- The iframe-framed-by-CMS detection skips Amplience (`id !== "amplience"`): its preview apps and visualizations come with `vse`/`/preview`, never a bare iframe.
- Time travel code lives under `providers/cms/amplience/` (`vse.ts`, `timeline.ts`, `time-store.ts`); `getTimePreview()` returns nothing unless Amplience is the active CMS, so a leftover `amp_vse` cookie does not show the banner on another CMS.
