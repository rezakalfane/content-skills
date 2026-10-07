# Pitfalls (each of these happened)

## Management API
- Content item without `_meta.name` -> "Content item name cannot be null". Localized value without its own `_meta.schema` -> "should have required property '_meta'".
- `PATCH /content-types/{id}/schema` with no body -> 400; send `{}`.
- Folder items: `GET /content-repositories/{repo}/content-items?folderId=` (the `/folders/{id}/content-items` path 404s).
- GraphQL asset API wants global ids (base64) for repository and folder, `assetFolders(first:)` max 50, `createAsset` returns only an id, `deleteAsset` returns a Boolean.
- The temporary upload URL must not receive the bearer token.
- Hub settings can't be written through the API (DAM `API_SECRET` is never returned): add Preview applications in the UI.
- Event with scheduled editions can't be deleted: unschedule, wait, delete. Edition slot content needs the edition-slot id and a locked snapshot with `_meta.rootContentItemId`.
- Updating an existing schema to localized form breaks old items (kept, but invalid). Enum additions are non-breaking.
- A Page's linked items are not published with it.
- Limits: asset folder GraphQL queries return at most 50 rows; the Filter API `page.size` is 1-12 (follow the cursor).

## Delivery / environments
- VSE rewrites `defaultHost` of image links and carries the timestamp in a pinned host: pin images to `cdn.media.amplience.net`; blank the host before hashing.
- A made-up pinned-host token returns latest content with HTTP 200: easy to miss. Copy the token from Amplience.
- VSE limit 7 req/s, 350/min shared by all modes: `429`; pace background work, back off, resume.
- The form model from `dc-visualization-sdk` isn't guaranteed to be `{_meta...}` or flattened: unwrap, inject schema, resolve localized values.
- `init()` of the SDK never resolves outside Dynamic Content: use a timeout and fall back to the saved view.

## Next.js / React
- Server Action requests go through `proxy.ts` with the current URL: params there are re-applied. Consume `?time=`/`?vse=` with a redirect.
- Setting a cookie in a Server Action already re-renders the page; adding `router.refresh()` renders twice. Overlapping `useTransition`s are batched, so a dragged slider updates only when released.
- `react-hooks` lint: no `Date.now()` in render, no `setState` synchronously in effects, declare functions before use in effects.
- React #418 hydration error from dates formatted on server vs browser timezone: `suppressHydrationWarning`.
- Partitioned cookies need identical attributes to be removed. `Secure; SameSite=None; Partitioned` for anything inside the Amplience iframe.
- Module state differs between Server Actions, renders and HMR reloads (and between serverless instances): shared state goes in `globalThis` locally and the Runtime Cache on Vercel.
- `after()` throws outside a request scope; wrap in try/catch and run directly.

## Vercel
- New CLI-created project is framework "Other": everything 404s until set to Next.js.
- Commits authored with an email not linked to the GitHub account never built (status UNKNOWN). Use the noreply identity.
- Functions freeze after responding: background work needs `after()` and `maxDuration`; instances are many: use the Runtime Cache for shared state.
- Preview deployment protection blocks the Amplience iframe: turn Vercel Authentication off for previews.
- `vercel link` can overwrite `.env.local`; keep a copy.
- GitHub Actions: an unquoted YAML value containing `: ` (e.g. `description: foo (default: bar)`) makes the whole workflow invalid; the run "fails" in 0 s with the commit title as its name. Quote it and validate with `yaml.safe_load`.
