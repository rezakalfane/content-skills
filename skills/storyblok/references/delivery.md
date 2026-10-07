# Content Delivery API notes

Base (EU): `https://api.storyblok.com/v2/cdn`; other regions use `api-us.`, `api-ca.`, `api-ap.` hosts.
Auth: `?token=<access token>` (query string).

- **Tokens decide visibility.** A **public** token serves only published content; a **preview** token can read `version=draft`
  and `version=published`. Use the public token on the live site and the preview token for draft/Visual Editor requests; the
  preview token must stay server-side.
- `GET /stories/<full_slug>?version=draft|published&language=fr` for one story; `GET /stories?starts_with=faqs/&per_page=100&page=1`
  for lists (max 100 per page; `total` header gives the count). A folder start page is requested by the folder slug (`blog`).
- **Relations:** pass `resolve_relations=blog_post.author,buying_guide.related_faqs`. The raw JSON keeps UUIDs in `content` and returns
  the resolved stories in a top-level `rels`; the JS client / `@storyblok/react` merge them into `content` for you.
- `language=fr` returns the `__i18n__fr` values in place of the default ones.
- Draft responses are not CDN-cached, published ones are (`cv` parameter busts the cache).
