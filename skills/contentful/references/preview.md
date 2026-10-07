# Preview and editing (VERIFY every item against the current docs and the user's plan)

> Verified on project 1 (Free plan): content preview URLs + Live Preview SDK inspector mode work; locale switching in the editor is Premium-only; `enableLiveUpdates` must be true for the save event. Details in SKILL.md.

- **Draft vs published**: CDA with the delivery token = published only; CPA with the preview token = drafts (and published). Same rule as the other CMSs: published reads on the live site, preview token
  only for editor requests, server-side only.
- **Content preview URLs**: Settings > Content preview: one or more preview platforms with URL templates per content type (tokens like `{entry.fields.slug}`, `{entry.sys.id}`, `{locale}`). Check whether the French
  editor can open `/fr/...` (a template using `{locale}`), and whether a signed/secret parameter can be added so the storefront can refuse unsigned draft requests (the storefront's `previewParams()` equivalent).
  If the editor only appends a plain flag, protect draft mode with a shared secret in the template instead of trusting the flag.
- **Live Preview SDK** (`@contentful/live-preview`): init in a client component on editor requests only; inspector mode via `data-contentful-entry-id`, `data-contentful-field-id`, `data-contentful-locale`
  (or `ContentfulLivePreview.getProps(...)`); live updates for server-rendered pages need a refresh strategy (the SDK subscribes to entry changes; on RSC pages trigger `router.refresh()` or a server action
  that revalidates, as done with the Storyblok bridge). Edit tags map onto our `$` object: `$` returns the attributes for a given entity/field.
- Contentful selects **fields** (unlike Storyblok which selects blocks), so `$.title`, `$.summary` can return distinct attributes: keep the existing `{...entry.$?.field}` pattern and generate per-field attributes.
- CSP `frame-ancestors` must allow `https://app.contentful.com` (and the EU app host); localhost in development only.
- Test with `cms-storefront-port/scripts/editor_iframe_test.mjs`, then ask the user to confirm inside the Contentful web app in both languages (not testable without their login).
