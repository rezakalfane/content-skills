# Schemas, content model and localization

JSON Schema draft-07 with Amplience extensions. Use `scripts/schema_kit.py` to write them in Python and `scripts/deploy_schemas.py` to push.

## Skeleton
```json
{ "$schema": "http://json-schema.org/draft-07/schema#", "$id": "https://content.example.com/hero-banner",
  "title": "Hero banner", "allOf": [{"$ref": "http://bigcontent.io/cms/schema/v1/core#/definitions/content"}],
  "type": "object", "properties": {...}, "propertyOrder": [...], "required": [...] }
```
- Schema id = `<namespace>/<name>`; content type uri is the same string. Keep one namespace per demo.
- Validation levels: CONTENT_TYPE (normal), **SLOT** (schedulable container, goes to the slots repository), HIERARCHY.
- Delivery key field: declare `"_meta": {"type":"object","properties":{"deliveryKey":{"type":"string"}}}` so editors see it; the key itself is set on the item.
- `trait:sortable` / `trait:filterable` on a schema enable sorted/filtered Filter API and GraphQL queries (`sortBy.key: default` uses the first sortable).

## Field-level localization
A localizable property:
```json
{ "title": "Title", "allOf": [{"$ref": ".../core#/definitions/localized-value"}],
  "properties": {"values": {"items": {"properties": {"value": {"title":"Title","type":"string","maxLength":120}}}}} }
```
Value: `{"_meta": {"schema": ".../core#/definitions/localized-value"}, "values": [{"locale":"en-US","value":"..."},{"locale":"fr-FR","value":"..."}]}`.
Markdown: put `"format": "markdown"` on the inner `value`. Arrays of localized strings work (each element is a localized object).
Enums, numbers, booleans, links are shared by all locales (map enum values to labels in the app). The hub must have the locales enabled.
Delivery flattens it: `?locale=fr-FR,en-US` returns the first locale that has a value, so untranslated fields fall back to English.
Don't create one item per language: one item with both languages avoids duplicate structure and keeps one delivery key.

## The Page pattern (stack components, URL = delivery key)
- `page`: `title`, `description`, `_meta.deliveryKey` (the path without language: `home`, `faq`, `about/team`), optional `image` (cover, for the card), `components[]`.
- `components[]`: links whose `contentType` enum lists the allowed component types (hero, feature block, text/image/video, rows of linked items, listings, FAQ section...).
- Detail pages (blog post, guide) keep their own type and route (`blog/<slug>`, `guides/<slug>`); everything else is served by one catch-all route.
- Listing components (`post-listing`, `guide-listing`) carry only labels; the app lists items with the Filter API.
- Add `sortOrder` integers where the app needs a stable order and cannot rely on the Filter API sort.
- Reuse schemas that already exist in the hub when asked; localizing them means a new version (breaking for old items).

## Slots
A slot schema has `slotContent` (array of content links, max N) and is registered in the **slots** repository. A Page links to the slot item; the app reads
`slotContent[0]` from the delivered slot. An empty slot renders nothing (design for that). Add a plain `campaign` string to carry the edition name (see scheduling.md).
