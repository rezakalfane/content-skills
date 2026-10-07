# Live Preview and Visual Editor

1. **Settings → Live Preview**: enable, choose the environment (the one your *staging/preview* site reads), add the preview
   token. **Settings → Environments**: set the **Base URL per locale** (`https://site` and `https://site/fr`; a localhost
   `local` environment is handy). Enable the Visual Editor / Visual Experience with the same URLs.
2. App: initialise `@contentstack/live-preview-utils` (v4) client-side only, in **SSR mode**, `mode: "builder"` for Visual
   Editor, with `stackDetails` (apiKey, environment, locale) and `clientUrlParams.host` (`eu-app.contentstack.com` for EU).
3. Server pages pass the live-preview query params (`live_preview`, `content_type_uid`, `entry_uid`) to the SDK.
4. Edit tags: spread `data-cslp` attributes on every element showing a field (`<h1 {...tag("title")}>`). Nested groups use
   `group.0.field`; repeated items need an index. Make each *visible* piece of content its own taggable element (a checklist
   shown as text but without tags cannot be edited visually even though the form can).
5. Allow the app to be framed: CSP `frame-ancestors` must include the Contentstack app origins, and the SDK/tags load only in
   preview or local development (`EDIT_MODE`) so production HTML stays clean.
6. Form sync: after a form edit the SDK emits an update and the page refetches; keep pages server-rendered and let
   `router.refresh()` run on the `onEntryChange` callback.

Common errors: 404 in Live Preview (base URL missing for that locale, or the page route requires a published entry);
Timeline-mode `setPageContext` ACK error (put page context in `<meta>` tags instead); duplicate React keys (de-duplicate by
uid); hero overlap (preview-only wrappers add elements; keep layout independent of them).
