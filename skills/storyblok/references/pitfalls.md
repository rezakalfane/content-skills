# Pitfalls

- **422 "The value of the field X … must be a string with numbers"**: number fields must be strings (`"377"`) on update.
- **`KeyError: 'EU'`**: region is upper-case in `.env.local`; lower-case it before indexing the host table.
- **Asset URL `//a.storyblok.com/...`**: protocol-relative; prefix `https:` or Next.js/`<img>` will resolve it wrongly in some contexts.
- **Relations come back as UUID strings** from the raw API; read `rels` or use the SDK with `resolve_relations`.
- **PUT replaces `content`**: send every field (and every `__i18n__` sibling), not just what changed.
- **A story and folder with the same slug conflict**: use a folder start page (`is_startpage`) for `/blog`, `/guides`.
- **429**: stay under ~3 requests/s; back off and retry.
- **BSD `sed` (macOS)** rejects multi-expression in-place edits with brackets: patch files with Python.
- **Preview token on a public site exposes drafts**: create a Public token for production.
- **`?_storyblok=1` must not unlock drafts**: verify the `_storyblok_tk` signature (sha1 of `space:previewToken:timestamp`).
- **Live-edit French shows English**: the bridge's unsaved story holds `field__i18n__fr`; apply the language before mapping.
- **Live edit consumed twice**: `generateMetadata` and the page both fetch; wrap fetchers in React `cache()`.
- **`vercel git connect` prints nothing when already connected** and can outlive a 2-minute shell timeout; re-run it to see the status.
- **Next route types missing** (`PageProps` not found) after copying a project without `.next`: run `npx next typegen`.
- **Editor opens `/home` or `/faqs/x` and 404s**: map those slugs in the proxy for editor requests. Do **not** fix it with a real path: that drops the `fr/` prefix and the French editor shows the English page.
- **Bridge test shows no CDN request**: the bridge is bundled now; check `window.StoryblokBridge` instead.
- **Bridge never registers**: `_storyblok` must equal the story id (not `1`), and the page must be in an iframe.
