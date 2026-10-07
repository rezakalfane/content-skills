# Time travel preview (preview deployments only)

What it gives: a banner on the staging site with a slider, date field, zoom −/+, previous/next change, Now, Exit; named edition bands; changed areas blink; swaps in ~5-20 ms
with no request. Everything is in `templates/next/` (components + `lib/timeline.ts`). Read this before changing it: it took many iterations.

## Entering and pinning
- Amplience passes `?vse=<time-pinned domain>`; you can also accept `?time=<date>` (needs the token below). `proxy.ts` (preview only) stores the host in a cookie and **redirects to the clean URL**
  (otherwise Server Actions, which are POSTed to the current URL through the proxy, re-apply the old param over the new time).
- Pinned host = `<vse id>-<token>-<unix ms>.staging.bigcontent.io`. The timestamp can be swapped freely. The `<token>` is not date dependent but **cannot be invented** (a wrong one silently
  returns latest content); copy it from a domain Amplience produced (any preview application) into `AMPLIENCE_TIME_TOKEN`. Undocumented format: could change.
- Cookie must be `Secure; SameSite=None; Partitioned` (framed in app.amplience.net). **A partitioned cookie is deleted only by a Set-Cookie repeating the same attributes** (`maxAge:0`).

## Making it fast (lib/timeline.ts)
Content changes at a few instants, so build a timeline instead of asking Amplience per step: probe the slider range at ~15 instants, bisect to the hour wherever neighbours differ,
resolve each gap as soon as known (equal probes or finished bisection) so it answers from memory immediately; progress = resolved gaps (the slider fill), markers = change points.
Hard-won details:
1. **Hash content with the pinned host removed** (`text.split(host).join("")`): the VSE rewrites image hosts and the timestamp is in the host, so every probe looked different and the bisection exploded (hundreds of requests, 429s).
2. **One probe = all requests of the timeline against ONE host** (one DNS+TLS), 4 probes at a time, requests paced to ~6/s (VSE limit 7/s, 350/min), exponential back-off on 429.
3. **Serverless**: a function is frozen after its response, so run the build inside `after()`; set `maxDuration = 300`; make builds **resumable** (save progress under a separate key, resume if the same requests); let the status
   poll **kick** a dead build. Requests may hit different instances, so keep the plan in the **Runtime Cache** (`@vercel/functions getCache`, per region, 2 MB per item, isolated Production/Preview): a small plan + one gzipped blob per distinct content state,
   a soft lock (one builder), a **stale plan keeps serving until the replacement is complete** (otherwise the UI "unloads/reloads"), keys registered by any instance (`setResolver` rebuilds loaders from the request key).
4. **Make the wait feel alive**: locate change points left to right, two gaps at a time (so markers and bands appear one by one, not all at the very end), show unresolved-but-changing
   stretches pulsing, and refit the zoom as markers arrive (a cold light page: ~20-45 s; the fill alone looked broken because the editions are exactly the gaps that need bisecting).
5. Heavy queries (36 posts over 3 pages per probe) make a page take ~1 min to preload; light pages ~25 s. Until ready the page falls back to one server round trip per step.

## Instant mode (components/time-variants.tsx + time-switch.tsx)
When the timeline is complete the server renders the page once per stretch of time (every data getter takes an optional `at`), the browser shows the matching one from a tiny client store, hidden copies preload images
(`loading="eager"`). The server only re-syncs (cookie, layout) 700 ms after the user stops. Don't wrap each move in `useTransition` (overlapping transitions are batched and nothing updates until you stop) and don't call
`router.refresh()` after a cookie-setting action (the action already refreshes: double render).
- Send one move at a time and wait until the `ts` prop echoed by the server equals the request before sending the next.
- Format dates in the browser's timezone: `suppressHydrationWarning` on server-rendered date text (React error #418).

## Change blink (components/change-flash.tsx)
Wrap each page component in `<Flash id value>`: a hash of its content is compared with the last one seen for that `id` (module-level map keyed by pathname), so switching variants (which remounts) still compares correctly; an area
that appears within 8 s of a user move also blinks; first paint never. Hidden preload copies are inside a `FlashQuiet` context.

## Zoom and bands
Window state over the full range (30 days back, a year ahead); auto-fit onto the first/last change ±14 days once; zoom steps 395/180/90/45/21 days around the current time. Bands = stretches between change points, named from
`segments` (server) or unnamed from markers (before the page states are loaded); hover shows name and dates.

## Warm it before anyone asks (demos should fly)
A cold build is 20-45 s (light pages) to 1-2 min (lists). Warm it: `app/api/warm/route.ts` (preview only, secret `WARM_TOKEN` header) registers the requests of a typical visit
(`warmRequests()`: build the request keys with the same helpers the data layer uses, `keyRequest` / `listRequest`, or they will not match) and **builds inside its own request**
(background work after a response did not finish reliably on Vercel: a warm started that way was left half done) and returns `{ready, markers, seconds}`; a GitHub Action
(`templates/github-actions/warm-timeline.yml`, event `deployment_status`, Preview only) calls it when a deployment is ready. The Runtime Cache is per project and environment, not per deployment,
so warming the new deployment warms the staging alias. Cache entry 4 h; stale plan (5 min) rebuilt in the background while serving; expose `builtAt` in the progress so the banner re-syncs the variants
when a fresher plan lands. Needs a `workflow`-scoped GitHub token to push the workflow file. In zsh never name a loop variable `path`.
