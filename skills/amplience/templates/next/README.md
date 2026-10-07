# Next.js templates (from the Commerce B2B demo, Next.js 16, React 19)

Copy into a Next.js App Router project, then adapt the `*.example.*` files (they hold the demo's content mapping).

| File | What it is | Generic? |
|---|---|---|
| `lib/amplience.ts` | Delivery API client: by key, by schema (Filter API, 12 per page + cursor), image URLs, production vs preview host, 429 back-off + pacing, time pin | yes |
| `lib/vse.ts`, `lib/hash.ts`, `lib/time-store.ts`, `lib/localized.ts`, `lib/markdown.ts`, `lib/image-loader.ts` | helpers (pinned host format, content hash, in-browser store, form-model localization, markdown, Dynamic Imaging loader) | yes |
| `lib/timeline.ts` | the time travel preload: probe + bisect, resolved gaps, Runtime Cache, soft lock, resume, `after()` | yes (set the resolver: `setResolver`) |
| `lib/content.example.ts` | maps raw delivery JSON to typed objects and exposes `getPage`, `getPosts`... | **demo specific** |
| `components/time-preview-bar.tsx`, `time-switch.tsx`, `time-variants.tsx`, `change-flash.tsx`, `flash.tsx` | the time preview UI: slider, zoom, markers, edition bands, instant variants, blink | yes (style classes are Tailwind + the demo's tokens) |
| `components/page-blocks.example.tsx` | renders a Page's stacked components | **demo specific** |
| `app/preview/*` | visualization route (saved preview + real-time via dc-visualization-sdk) | yes (`render.tsx` uses the demo's components) |
| `app/actions/time-preview.ts` | server actions: set the time, read progress | yes |
| `proxy.example.ts` | locale routing + `?time=` / `?vse=` pinning cookie | partly (the locale part is the demo's) |
| `time-travel.css`, `next.config.example.ts`, `i18n-strings.md` | CSS for blink and slider, CSP + image loader config, UI strings | yes |

Packages: `marked`, `dc-visualization-sdk`, `@vercel/functions`. Env: `AMPLIENCE_HUB_NAME`, `AMPLIENCE_DELIVERY_HOST` (empty = production CDN; the virtual
staging host on preview deployments), `AMPLIENCE_TIME_TOKEN` (preview only). Set `export const maxDuration = 300` in the root layout.
