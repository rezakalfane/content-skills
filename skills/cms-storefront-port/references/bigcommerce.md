# BigCommerce: translated content and URLs (already implemented in the reference repo)

- **The Storefront GraphQL API ignores `Accept-Language`.** The locale is a directive on the operation: `query Q($x: T) @shopperPreferences(locale: "fr") { ... }`
  (short code `fr`; `fr-FR` silently returns English). `gql()` in `lib/bigcommerce.ts` inserts it for non-default locales. (Found in the Catalyst client:
  `packages/client/src/utils/withShopperPreferences.ts` in the `commerce-b2b` project.)
- Translations are BigCommerce *Store Translations* (Admin GraphQL `store.translations(filters:{resourceType, channelId, localeId})`; check coverage with the
  `commerce-admin` skill). Names, descriptions, custom fields, categories, facet values and URL paths come back translated; facet filter names stay English.
- **URL paths are translated** and a path only resolves in its own language. Catalog URLs are `/products/...` (en) and `/fr/produits/...` (fr). `locales` on a product or
  category lists its path in every language (default unprefixed, others `/fr/...`): used for hreflang/canonical and for the switcher.
- Routes: `app/[locale]/[root]/...` with `CATALOG_ROOT` (`lib/i18n.ts`); `ensureCatalogRoot()` redirects another language's root permanently; `/api/switch-locale`
  looks up the counterpart page (keeps search/sort, drops `f.*` filters). The bare `/products` link maps via `localePath()`.
- **If the CMS has its own locale-level catch-all** for CMS-created pages (Amplience did: `app/[locale]/[...slug]`), a `[root]` route would shadow them: keep a static
  `products` route and rewrite each language's root onto it in `proxy.ts` with an `x-catalog-root` header (see the Amplience repo, `requestedCatalogRoot()`).
- Related products differ per language; spec highlights match on the default-language field name (`key`).
- Test: `scripts/urltest.py` (26 checks), plus a crawl of French pages for `href="/fr/produits` vs leftover `/fr/products` and for 404s.
