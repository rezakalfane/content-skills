# Localization

- Locales are codes like `en-us` (master) and `fr-fr`. Add them in Settings → Languages; set `fallback_locale`.
- A localized entry starts as a **copy** of the master and is then updated: `PUT ...?locale=fr-fr`. After changing a
  non-translatable field (image, reference) in English, re-run localization so copies stay aligned.
- Translate text, rich text, alt text, link titles and slugs-as-data; keep references and files as UIDs.
- Publish each locale separately (top-level `locale` in the publish body). Unpublished locales fall back when the SDK uses
  `.includeFallback()`.
- URL strategy used with Next.js: default language without prefix (rewritten internally to `/en`), others under `/fr`,
  `/en/...` redirects to the clean URL, shared slugs across locales (simple hreflang), `localePath()` helper for every link,
  `<link rel="alternate" hreflang>` for each page, and a language switcher that keeps the current path.
- UI strings (buttons, labels, errors) belong in a dictionary per locale, not in the CMS; navigation, banners, FAQs, guides and
  pages belong in the CMS in both languages.
- Commerce data localizes elsewhere (e.g. BigCommerce Store Translations); say clearly when product text stays English.
