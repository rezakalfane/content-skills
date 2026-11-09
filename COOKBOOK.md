# Prompt cookbook

Copy-paste prompts for each skill in this repository: 6 to 8 per skill, from first setup to debugging. Replace the `<placeholders>`; everything else works as written.

**How the skills are picked.** Claude Code loads a skill when your request matches its description, so you rarely need to name it. Mentioning the product (Contentful, Bloomreach, Vercel...) is enough. To force one, start with its name: "Use the `contentful` skill to...".

**Conventions every prompt relies on**

- Credentials live in the project's `.env.local`. Prompts never contain a token, and the skills never print one.
- Tags: **(read-only)** changes nothing. **(writes)** changes a CMS, an index or a catalog. **(outward)** pushes, deploys or publishes, and Claude stops to ask first.
- Ask for a dry run or a plan before any **(writes)** prompt on a system you care about: "list what you would change, then wait".

| Skill | Use it to | Prompts |
|---|---|---|
| [`cms-storefront-port`](#cms-storefront-port) | Port the storefront to a new headless CMS | 7 |
| [`switchable-cms-storefront`](#switchable-cms-storefront) | One app, several CMSs at runtime | 7 |
| [`contentful`](#contentful) | Contentful model, seed, preview | 7 |
| [`contentstack`](#contentstack) | Contentstack stack, publishing, Live Preview | 7 |
| [`storyblok`](#storyblok) | Storyblok components, stories, Visual Editor | 7 |
| [`amplience`](#amplience) | Amplience schemas, delivery, scheduling, time travel | 8 |
| [`bloomreach-search`](#bloomreach-search) | Bloomreach Discovery search and analytics | 8 |
| [`elasticsearch`](#elasticsearch) | Elasticsearch indices, hybrid search, French | 8 |
| [`my-vercel`](#my-vercel) | GitHub, Vercel projects, env vars, deploys | 7 |

---

## cms-storefront-port

The playbook for building the Commerce B2B storefront on a new CMS. Start here when the CMS is new to you.

### 1. Plan a port to a new CMS
```text
I want the Commerce B2B storefront on Sanity, like the Storyblok and Contentful versions. Read the cms-storefront-port playbook and give me the plan: the steps in order, what you will verify at each one, and the questions you need answered before you start. Don't change anything yet.
```
Reads `playbook.md` and returns the order of work (copy, model, seed EN+FR, connect, visual editing, docs, GitHub, Vercel) with a check per step.

### 2. Copy the reference and find the CMS boundary
```text
Copy the Storyblok storefront into ~/Workspaces/Sanity/storefront as a fresh git repo. Then list the files that are CMS-specific (the data layer and the editing glue) versus the ones that must stay untouched, and show me the shapes the pages expect from the data layer.
```
Uses `boundary.md`. Rule 1 of the skill: same UI, new CMS, so only `lib/<cms>.ts`, `lib/blog.ts`, `lib/site.ts` and the editing glue change. **(read-only after the copy)**

### 3. Design the content model before seeding
```text
Draft the content model for <CMS> from the page shapes in the reference storefront: types, fields, which are localized, and the references between them. Show it as a table I can approve, and note any plan limit (content types, locales) that would force a merge.
```
Gets the model approved before any write, as the "step by step, user in the loop" rule asks.

### 4. Seed both languages
```text
Once I approve the model, seed English and French content for the whole storefront. Make the script idempotent (rerunning updates in place), create linked items before the ones that reference them, and finish with a count of what exists per type and locale. Credentials are in .env.local.
```
**(writes)**

### 5. Add French catalog URLs and the language switcher
```text
The BigCommerce catalog has French names and descriptions. Make the French pages use translated product and category URLs, with a language switcher that lands on the matching page and correct hreflang tags. Follow references/bigcommerce.md and tell me which parts are already in the reference code.
```

### 6. Verify like a user, in both languages
```text
Run scripts/urltest.py against the dev server and then against production. Show the failures only, with the URL and what you expected. Then load a page in a cross-origin iframe the way the CMS's visual editor does and check hydration and edit attributes. Say plainly what you could not test because it sits behind the CMS login.
```
Runs the 26 URL checks and `editor_iframe_test.mjs`.

### 7. Check the repo before it goes anywhere public
```text
Before I make this repository visible, scan the whole tree for every value in .env.local, for store identifiers and for any other CMS's name. Then draft the README, docs and HISTORY.md, and wait for my go-ahead before creating the GitHub repo or pushing.
```
**(outward)** gated on your go-ahead.

---

## switchable-cms-storefront

One Next.js app whose CMS changes at runtime (Amplience, Contentful, Storyblok, Contentstack).

### 1. Explain the architecture
```text
Walk me through how the switchable storefront decides which CMS serves a request: the resolution order, the trusted headers, and where each CMS is allowed to frame the app. Use the real files in content-commerce-b2b.
```
Reads `architecture.md` and `proxy.md`: editor parameters with signature gates, then an iframe framed by the CMS app, then the cookie, then the default.

### 2. Add a fifth provider
```text
Add Sanity as a provider in content-commerce-b2b. Show me the files you will create (meta, gates, mapper, index) and the registry entry, keep component code free of CMS names, and compare it against an existing provider before anything else.
```
Follows the "contract + lazy registry + capabilities as data" shape. **(writes)**

### 3. The switch needs two clicks
```text
Switching CMS in the settings panel shows the previous CMS until I click again. Find why and fix it.
```
Known cause: `setCms` must only store the cookie and the client then calls `router.refresh()`; a `refresh()` inside the action renders with the old cookie.

### 4. "Refused to connect" in an editor frame
```text
Opening a page from the <CMS> editor shows "refused to connect". Check the frame-ancestors union, the cookie attributes inside the frame, and whether the proxy recognizes the editor request. Give me a ranked list of causes and the check for each.
```
Covers `frame-ancestors`, `SameSite=None` cookies and the iframe detection.

### 5. The wrong CMS shows up
```text
A visitor with no cookie sometimes sees content from the wrong CMS. Audit every cache in the data layer and tell me which ones are not keyed by provider.
```
Rule 4: everything cached per request is keyed by provider or lives inside the provider.

### 6. Parity test two providers
```text
Compare the Contentful and Storyblok providers on the home page, the FAQ and one blog post in both languages: screenshot both, diff main innerText line by line, then do a pixel diff. Ignore lazy-image noise and report the text differences first.
```
Text diffs are reliable; pixel diffs from lazy images are not. Published data is cached 60 s, so wait after reseeding.

### 7. Make a capability module for one CMS only
```text
Time travel only exists for Amplience. Show how a capability is declared as data and wired so it disappears for the other providers, then check no component names a CMS.
```

---

## contentful

Verified on a real space: model, EN+FR seeding, connection, Live Preview with typed edits, Vercel.

### 1. First hour on a new space
```text
Do the Contentful first-hour checklist on my space: find the data region, list locales and content types, tell me the plan limits that matter (content types, locales, environments), and what Live Preview options my plan has. Read-only.
```
**(read-only)** Probes both regions, because only the right one answers.

### 2. Add French
```text
Add French as a second locale with English fallback. If the API refuses, tell me whether it's a permission or a plan limit before you try anything else.
```
A 403 from `POST /locales` is a plan limit (Free: 2 locales), not a permission problem. **(writes)**

### 3. Model the storefront within 25 content types
```text
Create the content types for the Commerce B2B storefront as block-composed pages, staying inside the Free plan's 25 content types. Use one generic collection block plus text, image, video, hero and feature blocks, and show me the type list before you create it.
```
Gives 18 types in total. **(writes)**

### 4. Seed entries and assets
```text
Seed the English and French content: assets first, then guides, FAQs, spotlights and posts, then pages. Skip the write when nothing changed so reruns are instant, publish linked entries before the ones that reference them, then verify with the Delivery and Preview APIs.
```
**(writes)**

### 5. Set up Live Preview
```text
Create the preview platform for my staging and production URLs, add the Live Preview SDK to the storefront, and tag the DOM so clicking a field in the editor focuses it. Wrap init in try/catch so it never breaks the page outside the editor.
```
The SDK throws "The current origin is not supported" outside Contentful's app.

### 6. Typed edits show before I publish
```text
Make unsaved edits in the Contentful editor appear in the preview as I type, including reordering blocks. Keep the components, use a server action with a short-lived overlay and refresh(), and check it with a local parent page that fakes the editor's messages.
```
Describes the overlay approach in `SKILL.md` ("Typed edits and speed").

### 7. Migrate and prune without downtime
```text
We moved to the block model. Take a backup, reseed in the final model, then show me what prune would remove (extra fields, types with entry counts). Run the prune only after I say so.
```
Order: readers deployed, content published, verified, `backup.py`, then `schemas.py --prune`. **(writes)**

---

## contentstack

Stack, content types, entries, publishing per environment and locale, Live Preview, Visual Editor.

### 1. Audit the stack
```text
Connect to my Contentstack stack and report the region, the environments, the content types with entry counts and the locales. Tell me how close I am to the plan limits. Don't change anything.
```
**(read-only)** A wrong host answers "api_key is not valid", so the region comes first.

### 2. Give me the right tokens
```text
What tokens does the storefront need, which ones can you create and which must I create in the app? Give me the exact steps and the .env.local variable names.
```
Delivery and preview tokens can only be created in the app; the management token never reaches Vercel or the browser.

### 3. Block-composed pages
```text
Add a modular-blocks "components" field to the page type with hero, feature, text, image, video and collection blocks, and a "content" blocks field on posts. GET the type, append, then PUT the whole schema.
```
**(writes)**

### 4. Seed and localize
```text
Seed the content in en-us and fr-fr with a script I can rerun. Localized entries need the whole blocks field again, with references and asset uids. Regenerate rich-text uids when copying a body into a block.
```
Duplicate RTE uids are rejected. **(writes)**

### 5. The site shows an empty home page after a seed
```text
After the seed run, production shows a home page without its blocks. Find what is unpublished, publish it to every environment the deployed sites read, and respect the workflow stage if a publishing rule requires it.
```
Seed scripts leave entries unpublished elsewhere and reset them to the first workflow stage. **(outward)** publishing to production waits for your go-ahead when a gate exists.

### 6. Live Preview that reacts to edits
```text
Live Preview doesn't update when I edit or reorder blocks. Check that the SDK loads on the first request of the pane, that the proxy passes live_preview as trusted headers, and that a stale hash falls back to published content instead of failing.
```
Gating the SDK on `live_preview` breaks reordering. Stale hash is `error_code 382`.

### 7. Point Live Preview at a new site
```text
I have no free environment left. Repoint the base URLs of the existing one to my new site, French under /fr. Save the old values first and show me the diff.
```
The 4th environment fails with `error_code 133`; the skill reuses one rather than deleting it. **(writes)**

---

## storyblok

Components, stories, field-level translation, Management API, Visual Editor bridge.

### 1. Map concepts from another CMS
```text
I know Contentstack and Amplience. Explain Storyblok to me in their terms: entries, environments, localization, references, and where drafts live. One table, then the three differences that will trip me up.
```
Reads `references/differences.md`.

### 2. Model the pages with bloks
```text
Create the page component with a bloks "components" field restricted to hero, feature, text, image, video and one generic collection block. Add components additively, since a component PUT must contain every existing field, and show me the list first.
```
**(writes)**

### 3. Seed a bilingual demo
```text
Seed the whole demo into the pages/ folder with English and French (field-level __i18n__ translation). Pace the Management API at about 3 requests a second, retry on 429, and make reruns update in place by slug and file name.
```
A 76-story + 62-asset load takes about 5 minutes. **(writes)**

### 4. Fix a 422
```text
The Content Delivery API returns 422 "must be a string with numbers" when I fetch a story. Find the cause in my data layer.
```
Usually `per_page` sent to `cdn/stories/<slug>`; it is only valid on list requests.

### 5. Relations and language in the data layer
```text
Make the data layer resolve internal story relations with resolve_relations and apply language=fr properly, without relying on a client library. Test draft vs published in both languages.
```

### 6. Wire the Visual Editor
```text
Make the Visual Editor work on my Vercel preview: registerStoryblokBridge, a signed _storyblok URL check, a server action that holds the unsaved story for a few minutes, and refresh(). Add the environments for production, staging and local https by merging into the existing ones.
```
**(writes)** to the space settings.

### 7. Prune after a model change
```text
Back up the components and every story in full, reseed posts and pages in the final model, then list what prune would delete with story counts. Wait for my go-ahead before running it.
```
**(writes)**

---

## amplience

Schemas, delivery keys, Production vs Preview, visualizations, scheduling, content type cards, time travel.

### 1. Redo a whole demo
```text
Redo the Amplience storefront demo on my hub. Read the playbook, ask me what you need (hub name, repository, locales, site URLs), then give me the order of work and how each step is verified.
```
Uses `references/playbook.md` and `amp.py` discovery by name.

### 2. Write and deploy schemas
```text
Create the localizable content schemas for the block model (hero/slot, text, image, video, feature, categories, spotlights, guides, posts, listings, FAQs) with schema_kit.py, then register, sync and assign the content types.
```
**(writes)**

### 3. Seed content and assets
```text
Upload the images, then seed the English and French items. Items are upserted by label, assets by name, linked items first, leaves published first. Pace requests to stay under the rate limit and back off on 429.
```
VSE is limited to 7/s and 350/min. **(writes)**

### 4. Production vs Preview on Vercel
```text
Make one environment variable switch between the published CDN and virtual staging, make /preview a 404 in production, and keep the personal access token out of Vercel entirely.
```

### 5. Real-time preview
```text
Add Preview and Real-time preview visualizations to the content types, pointing at my staging site, using visualizations.py. Then show me how the /preview route renders a draft.
```
**(writes)**

### 6. Schedule a hero change
```text
Create an event with two editions on the hero slot, one for a spring launch and one for the summer sale, plus snapshots, using schedule_template.py. Print the edition names it produced and flag any EDITION_SLOT_* error with its cause.
```
**(writes)**

### 7. Time travel preview
```text
Set up the time travel preview: the timeline bar, ?time= on preview deployments only, the amp_vse cookie, /api/warm with WARM_TOKEN and the warm-timeline workflow. Confirm production ignores ?time=.
```
Needs `AMPLIENCE_TIME_TOKEN`; read `references/time-travel.md`.

### 8. Content type cards
```text
Generate content type cards for every type with cards.py using a config I can edit, and show me the config before you apply it.
```
**(writes)**

---

## bloomreach-search

Data Hub catalog loading, Search and Autosuggest, merchandising, tracking and deployment.

### 1. Load the catalog
```text
Build the Bloomreach records from my BigCommerce catalog, show me the counts and the attribute list, then apply the schema and load. Check BR_COLLECTION against the guard and tell me the item type first. Wait for me before running anything that writes.
```
`build.mjs` writes files only; `apply-schema.sh` and `load.sh` write to the guarded collection and re-sync the destination. **(writes)**

### 2. Why were no documents indexed?
```text
Data Hub shows my items but the Discovery index says "No documents were indexed" (products_no_title_count equals the product count). Find the cause.
```
System attributes must keep `family: "system"`; only custom ones use `main`.

### 3. Query the Search API
```text
Run these searches against staging and show count and top hits: "exide", "agm battery", "12v", "car battery". Then do one with facets and tell me which facets came back and why.
```
**(read-only)** Dynamic facets are query-aware; manual ones need `facet.field`.

### 4. Check why Autosuggest is empty
```text
Typing in the search box shows no suggestions. Run suggest-check.py and tell me whether Autosuggest serves the current catalog or a stale index, and what I should ask Bloomreach for.
```
**(read-only)**

### 5. Verify a merchandising rule
```text
I saved a boost rule for "charger" and a redirect for "warranty". Check both against the API, not the dashboard preview, and make the storefront follow the facet order and the redirect. Mention if a sort parameter overrides the ranking rule.
```

### 6. Build the type-ahead and the debug panel
```text
Add a type-ahead search box with keyboard support and a debug drawer listing every Search and Suggest call with redacted URL, timing and status. Check that the served HTML and JSON never contain the auth key, and test plain Enter in the box.
```

### 7. Add content search
```text
Add FAQ, buying guides and blog to the global search. Dry-run load-content.mjs first and show me what it would load; if Data Hub can't feed a Search content catalog, say what the alternative is.
```

### 8. Tracking, A/B tests and audiences
```text
Add the Bloomreach pixel with the _br_uid_2 cookie created in the proxy, page views for search, category, product and content, suggest click events, and a conversion view fired once per order. Send debug=true events in tests and tell me what to look at in Event diagnostics.
```
Pixel domains must be whitelisted by Bloomreach first.

---

## elasticsearch

Serverless or Cloud, the `elastic` CLI, hybrid lexical + semantic search over the catalog and content.

### 1. Set up the CLI and smoke test
```text
Set up the elastic CLI for my cluster and run the smoke test. If it fails on the agent-env packaging issue under Node 24, apply the fix and tell me it is overwritten by a reinstall.
```
`elastic es info` is the smoke test.

### 2. Build and load the catalog
```text
Build the products and content documents from my BigCommerce channel and the running storefront, show counts, then load them into the guarded indices. Check ES_GUARD_INDEX first and don't pass --recreate unless I say so.
```
**(writes)** Expect 150 products and 114 content docs on the reference data.

### 3. Compare lexical, semantic and hybrid
```text
Run "battery for a car with start-stop that will not leak" three ways: multi_match, semantic, and RRF hybrid. Show the top five of each and tell me which I should use for the search box.
```
**(read-only)** Semantic scores are flat on a small catalog: cut by top-N, not by score.

### 4. Add French
```text
Add French search: name_fr, description_fr and category fields with the french analyzer, copy_to the semantic field, translated custom fields, and French typos handled. Add them to the live index with --update-mapping instead of recreating.
```
**(writes)** Uses the Storefront GraphQL API with `@shopperPreferences(locale: "fr")`.

### 5. Change an analyzer with no downtime
```text
I need a different French analyzer. Load a new products_v3 index, then swap the alias atomically. Do a --dry run of the swap first.
```
Analysis settings can't change on a live index. **(writes)**

### 6. Create the keys
```text
Give me the Kibana Dev Tools request to create a read-only key for the storefront that works through the alias, including the retrievers. Then check it with _has_privileges called as that key, without writing anything with it.
```
Needs `products_v*` and `monitor_inference`. Never test a key by writing with it.

### 7. Type-ahead with typo tolerance
```text
Add completion suggestions for "agm bat" and a typo like "exdie", with exact matches first. Make sure digits survive (12v 60ah) and French has its own field.
```
Use `standard` analyzers on the completion field, since the default strips digits.

### 8. Search analytics for merchandisers
```text
Set up the search-events index, then seed 45 days of synthetic traffic after a --dry preview. Explain what click-through and "no word match" mean in the dashboard.
```
**(writes)** Seeded events are marked `synthetic: true` and rerunning removes only those.

---

## my-vercel

GitHub, Vercel project, environment variables, deploys and debugging for the storefronts.

### 1. Put a new storefront online
```text
Take this storefront from a local folder to a Vercel project: scan for secrets, create a private GitHub repo, link the project, set the environment variables from .env.local without printing them, and give me the deploy command to run myself.
```
**(outward)** Claude prepares everything; you run `! vercel deploy --prod ...` because the agent can't.

### 2. Check the variables are not empty
```text
Verify my Vercel variables are really set. Don't trust vercel env ls, and don't try to read production values back.
```
Without `--yes`, `vercel env add` stores an empty value and exits 0.

### 3. Deploy by push
```text
I changed the search config. Set the variable first, commit, and push to main so production deploys. Then poll the live site with curl until the change shows.
```
**(outward)** A push to `main` deploys production.

### 4. My build fails
```text
The latest deployment failed. Read the build log from the end, tell me which variable or hostname is wrong, and fix it.
```
Many `fetch failed` lines followed by `Error occurred prerendering page` usually point at a missing variable.

### 5. Rotate a key safely
```text
Rotate the Elasticsearch read-only key: create the new one, set it in Vercel, redeploy, verify the French pages, the type-ahead and hybrid ranking with it, and only then tell me to delete the old one.
```
Deleting first took a production site down until a redeploy.

### 6. Toggle the debug panel
```text
Turn the search debug panel on in production for a demo, remind me it is public, and turn it off after.
```
`SEARCH_DEBUG=1` or `BR_DEBUG=1`; takes effect on the next deployment.

### 7. Vercel blocks the commit author
```text
Vercel refuses my production deployment with "couldn't find a Git account for the commit author". Fix the repo-local git identity and push a new commit.
```
Set the no-reply address `<id>+<login>@users.noreply.github.com` (`gh api user -q .id`).

---

## Combining skills

Real jobs cross skills. These prompts name the order so Claude loads each at the right moment.

- **New CMS end to end:** "Port the storefront to <CMS> following `cms-storefront-port`, use the `<cms>` skill for API details, and the `my-vercel` skill to deploy. Stop for my approval after the model, after the seed and before anything public."
- **Search end to end:** "Load the catalog into Elasticsearch (`elasticsearch`), deploy with a read-only key (`my-vercel`), then repeat for Bloomreach (`bloomreach-search`) and compare the two result lists for ten queries."
- **Add a CMS to the switcher:** "Port to <CMS> in a standalone repo first, then add it as a provider in the switchable app and run the parity test."

## Writing your own prompts for these skills

1. **Name the system and the target**, not the method: "my Contentful space", "the staging catalog".
2. **State the boundary**: "read-only", "dry run first", "wait for me before writing", "don't push".
3. **Ask for evidence**: counts, the failing URL, the API response, a screenshot. The skills are written to verify by API and in a browser.
4. **Ask for what could not be tested.** Anything behind a CMS login should be reported as untested rather than assumed.
