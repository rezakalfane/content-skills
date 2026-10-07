# Reading content in an app (Delivery SDK)

## Tokens and environments

- A **delivery token** is bound to one environment; asking another returns *"Environment was not found"*.
- A **preview token** (created with the delivery token) reads **unpublished/draft** content for Live Preview, through the
  preview host (`rest-preview` / `eu-rest-preview.contentstack.com`).
- Use one token pair per environment: Vercel Production scope gets `production`, Preview scope gets `preview`. Expose the
  environment in a response header (`X-Content-Environment`) so you can confirm which one a deployment reads.

## SDK (`@contentstack/delivery-sdk` v5, TypeScript)

```ts
import contentstack from "@contentstack/delivery-sdk";
const stack = contentstack.stack({
  apiKey, deliveryToken, environment,
  region: Region.EU,                       // derive hosts from region
  live_preview: { enable: true, preview_token, host: "eu-rest-preview.contentstack.com" },
});
const res = await stack.contentType("faq").entry().locale("fr-fr").includeFallback().find();
```

- `.locale(code)` selects a language; `.includeFallback()` returns the fallback locale's content where untranslated.
- `.includeReference(field)` or, in preview, `includeReferenceContentTypeUID` so referenced entries carry their type.
- Filter with `.query().where("field", QueryOperation.EQUALS, v)`; paginate with `.limit()/.skip()`.
- In a Server Component, create the stack per request and call `stack.livePreviewQuery(searchParams)` when a preview hash is
  present. Duplicates can appear in preview (published + draft): de-duplicate by `uid`.

## Rendering

- Rich text: `jsonToHTML({entry, paths:["body"]})` from `@contentstack/utils`; sanitize if the content is not trusted.
- Images: allow the Contentstack asset host (`eu-images.contentstack.com`, `images.contentstack.io`, ...) in
  `next.config` `images.remotePatterns`; use the Image Delivery API query parameters (`width`, `format=webp`, `quality`).
- Editable tags: `addEditableTags(entry, contentTypeUid, true, locale)` adds `data-cslp` metadata (preview only).

## Next.js 16 notes

`params` and `searchParams` are Promises; `middleware` is `proxy.ts`; read each page's entry in Server Components. Contentstack
reads are not cached by default; add publish webhooks → revalidation (tags/paths) before production traffic.
