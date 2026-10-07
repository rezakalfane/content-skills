# Management API notes (verified on an EU space)

Base: `https://mapi.storyblok.com/v1/spaces/<space_id>`; header `Authorization: <personal access token>` (no `Bearer`).

## Space and languages
- `GET ""` → `space` (name, plan, `languages: [{code,name}]`, `default_lang_name`).
- Add a language: `PUT ""` `{"space": {"languages": [{"code": "fr", "name": "French"}]}}` (the default language has no code).

## Components (the content model)
- `GET /components`, `POST /components` `{component: {...}}`, `PUT /components/<id>`, `DELETE /components/<id>`.
- Body: `name`, `display_name`, `schema`, `is_root` (content type), `is_nestable` (block). Fields in `schema` need a `pos`.
- Field types used: `text`, `textarea`, `richtext`, `number`, `datetime`, `boolean`, `asset` (`filetypes: ["images"]`),
  `option` (single, `options: [{name,value}]`), `options` (multi), `bloks`, `multilink`.
- Mark a field `translatable: true` to get field-level translation.
- Reference to other stories: `option` (one) / `options` (many) with `source: "internal_stories"` and `filter_content_type: ["author"]`.
- Nested blocks: `bloks` with `restrict_components: true`, `component_whitelist: [...]`, optional `maximum`.
- Deleting a component that stories still use is possible but leaves those bloks orphaned: rewrite the stories first.
- The blueprint created by `npx storyblok create` brings `page`, `teaser`, `grid`, `feature` and a `home` story: overwrite `page` and `home`.

## Stories and folders
- Look up: `GET /stories?with_slug=<full_slug>` (folder start page: `with_slug=blog/`).
- Create folder: `POST /stories` `{story: {name, slug, is_folder: true, default_root: "blog_post"}}`.
- Create story: `POST /stories` `{story: {name, slug, parent_id, content: {component: "blog_post", ...}}, publish: 1}`.
- Update: `PUT /stories/<id>` with the **whole** `content` (it replaces, it does not merge) and `publish: 1`.
- **Folder root story:** `POST` with `parent_id=<folder id>`, `is_startpage: true`, any slug (`index`); it is served at the folder URL
  (`/stories/blog` returns `full_slug: "blog/"`). Use it for list pages (`/blog`, `/guides`).
- A story and a folder cannot share a slug at the same level (hence start pages for `/blog` and `/guides`).
- Story `uuid` (not `id`) is what reference fields store.

## Field-level translation
- In `content`, translatable fields have siblings `<field>__i18n__<code>`; inside nested bloks too. One PUT writes all languages.
- Read with `?language=fr` (non-translated fields are returned as-is).

## Assets (signed upload, three steps)
1. `POST /assets` `{filename, size: "WxH", validate_upload: 1}` → `{id, post_url, fields, pretty_url}`.
2. `POST` multipart to `post_url`: all `fields` first, then `file` last (S3, no auth header).
3. `GET /assets/<id>/finish_upload`.
- `pretty_url` is **protocol-relative** (`//a.storyblok.com/f/<space>/<WxH>/<hash>/<name>`): prefix `https:`.
- Idempotency: `GET /assets?search=<file name>` and match the end of `filename`.
- Asset field value: `{id, alt, name, focus, title, source, filename: <https url>, copyright, fieldtype: "asset", meta_data: {}}`.

## Rich text
`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"…"}]}, {"type":"heading","attrs":{"level":2},"content":[…]},
{"type":"bullet_list","content":[{"type":"list_item","content":[{"type":"paragraph","content":[…]}]}]}]}`; a link is a text node with
`marks: [{"type":"link","attrs":{"href":"/guides","linktype":"url","uuid":null,"anchor":null,"target":null}}]`.
