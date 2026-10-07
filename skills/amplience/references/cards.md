# Content type cards (thumbnails in the content browser)

`settings.cards[] = {templatedUri}` on the content type (`scripts/cards.py` + `cards_config.example.py`). Built-in templates at
`https://bigcontent.io/cms/cards/<kind>/index.html?<params>&src=<where to read the item>`:

| kind | params |
|---|---|
| `summary-photo` | `headline`, `image`, `imageAlt` (image and text under it) |
| `photo` | `image`, `imageAlt` |
| `gallery` | `headline`, `image0`..`image3` (1-4 images) |
| `text` | `headline` (centred, 24 pt) |
`src` = `%2F%2F{{vse.domain}}%2Fcms%2Fcontent%2Fquery%3FfullBodyObject%3Dtrue%26query%3D%257B%2522sys.iri%2522%253A%2522http%253A%252F%252Fcontent.cms.amplience.com%252F{{content.sys.id}}%2522%257D%26scope%3Dtree%26store%3Dstaging`
(copy it exactly from `scripts/cards.py`).

Params are **JSON pointers into the content tree**: they follow content links (`/image/image` = the linked `image` item's DAM image) and index arrays
(`/spotlights/0/image/image`). Localized fields keep their wrapper in this v1 graph, so point at **`/title/values/0/value`** (first locale), not `/title`.
Mapping that worked: summary-photo for anything with an image + title (page via a cover image field, hero, blog post, guide, product, author, slot via `/slotContent/0/...`),
gallery for rows of linked items, photo for images, text for FAQs / messages / listings. Verify by rendering the template URL in a headless browser with the real VSE host and item id.
A page whose first component varies has no single image pointer: add an optional cover image field to the schema.
