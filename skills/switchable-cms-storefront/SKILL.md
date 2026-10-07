---
name: switchable-cms-storefront
description: >-
  Build or extend ONE Next.js app that can switch its headless CMS at runtime (Amplience, Contentful, Storyblok, Contentstack...): a
  ContentProvider and Capabilities contract in core/, a lazy provider registry, a proxy that decides the CMS per request (editor
  parameters with signature gates, then an iframe framed by the CMS's app, then a cookie, then a default), trusted request headers
  stripped from the client, a frame-ancestors union, SameSite=None cookies inside editor frames, per-request caches keyed by provider,
  a settings-panel switcher, per-CMS capability modules (time travel only for Amplience), and parity testing between providers. Use
  when the user wants "one app, several CMSs", a CMS switcher or settings panel, to add a provider to content-commerce-b2b, to make
  a CMS's preview pane or editor land on the right provider, or to debug "refused to connect" in an editor frame, the wrong CMS
  showing, or a switch that needs two clicks.
---

# Switchable CMS storefront

Reference implementation: `~/Workspaces/content-commerce-b2b` (private repo, Vercel project `content-commerce-b2b`; `main` = Production, `staging` = Preview). It is the Commerce B2B storefront (BigCommerce for commerce) with four CMS providers behind one contract. A single-CMS repo is this project minus the other providers, the switcher and the time travel modules (recipe: `cms-storefront-port`, playbook section 9). Content model: `amplience/references/blocks.md`.

| Read | When |
|---|---|
| `references/architecture.md` | the contract, registry, request flow, caches, adding a provider |
| `references/proxy.md` | the resolution order, gates, trusted headers, CSP, cookies in frames |
| `references/switcher-and-parity.md` | the settings panel, capability modules, parity testing, what was hard |

## The shape
```
core/content.ts        Block/Page/Post/... model, ContentProvider, Capabilities, CmsId   (no CMS names in components)
core/edit.ts           Tagged / tag(): the `$` edit attributes, empty outside preview
providers/cms/meta.ts  static facts per CMS (ready, capabilities, frameAncestors, editorParams, editorUrl); no heavy imports
providers/cms/gates.ts draft gate per CMS (does this request carry verified editor credentials?)
providers/cms/index.ts lazy registry: loaders[id] = () => import("./<id>")
providers/cms/<id>/    client, mapper (CMS content -> core model), index.ts exporting `provider`, edit support, live editing
lib/content.ts         facade the pages call: delegates to the provider of this request
lib/request.ts         activeCms(), isPreviewRequest(), inEditor(): React cache() over trusted headers
proxy.ts               resolves the CMS, sets trusted headers, locale routing, CSP, cookie
app/actions/cms.ts     setCms(id): stores the cookie only
components/cms-switcher.tsx   the settings panel (hidden inside editors, off in Production unless DEMO_SWITCHER=1)
```

## Rules that held
1. **Components never name a CMS.** They render `core/content.ts` shapes; a provider maps its content into them. Capability differences are data (`Capabilities`), not `if (cms === ...)` in components (the few remaining `edit-support` and time-bar cases are provider modules).
2. **The proxy decides, the app obeys.** The CMS and the draft state travel as request headers the proxy sets after deleting any client copy. Never read the cookie or a query parameter in the data layer.
3. **A server action cannot switch what it just changed**: `setCms` stores the cookie only; the client then calls `router.refresh()`. A `refresh()` inside the action renders with the request's old cookie (the proxy ran first), so the page shows the previous CMS and a second click is needed.
4. **Everything cached per request is keyed by provider or lives inside the provider** (see `references/architecture.md`), otherwise one CMS's data is served for another.
5. **Compare every new provider with an existing one before anything else** (same pages through each CMS by cookie: text diff, then pixel diff).
6. Credentials only in `.env.local` (names in `.env.example`), never printed; a private repo needs a noreply commit author or Vercel blocks the deployment; no pushes or deployments without the user's go-ahead.
