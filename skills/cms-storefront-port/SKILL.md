---
name: cms-storefront-port
description: >-
  Playbook for porting the "Commerce B2B" Next.js storefront (same pages, images and UI, BigCommerce for commerce) to another headless CMS,
  as done for Amplience, ContentStack and Storyblok. Covers the order of work (copy the reference repo, model, seed EN+FR, connect, visual
  editing, docs, GitHub, Vercel), the CMS boundary in the code, BigCommerce French content and translated catalog URLs, verification
  scripts, and the pitfalls hit on the way. Use when the user wants to build the same storefront on a new CMS (Contentful, Sanity,
  Prismic, Hygraph, Strapi, DatoCMS...), redo a demo "like the other integrations", or asks how the existing ones were built.
---

# CMS storefront port

Done three times (Amplience, ContentStack, Storyblok) on the same storefront, then the three single-CMS builds were ported again to the block model. The **Storyblok repo is the most complete single-CMS reference**:
`~/Workspaces/Storyblok/storefront` (GitHub `rezakalfane/storyblok-commerce-b2b`). Copy from it, not from the older ones.

| Read | When |
|---|---|
| `references/playbook.md` | the step-by-step plan, with what to verify at each step |
| `references/boundary.md` | which files are CMS-specific, the shapes the pages expect, the content model to recreate |
| `references/bigcommerce.md` | French catalog content, translated URLs, switcher, redirects (already in the reference code) |
| `references/delivery.md` | GitHub, Vercel, docs, screenshots, history, permissions |
| `references/pitfalls.md` | everything that went wrong, so it does not again |
| `references/playbook.md` section 9 | porting an existing single-CMS storefront to the block model (copy the neutral tree, provider swap, deploy order, parity, prune) |
| `../switchable-cms-storefront/SKILL.md` | one app that switches CMS at runtime (the donor of the neutral code) |

`scripts/urltest.py <base-url>`: 26 checks (pages, redirects, language switch, hreflang, 404s) run against dev or production.
`scripts/editor_iframe_test.mjs`: loads a page in a cross-origin iframe the way a visual editor does and checks hydration, edit attributes
and the bridge (adapt the bridge globals per CMS).

## Rules that held across all three projects

1. **Same UI, new CMS.** Keep the page components. Only the data layer (`lib/<cms>.ts`, `lib/blog.ts`, `lib/site.ts`) and the editing glue change.
2. **Step by step, user in the loop**: model + seed, then connect, then visual editing, then cleanup/docs. Confirm at each boundary.
3. **Credentials only in `.env.local`** (gitignored; names in `.env.example`). Never read, print or ask for token values. Pipe them from
   the file into Vercel without echoing. Scan the tree for every value before any public push. Management/personal tokens never go to
   the host or the browser.
4. **Drafts must not leak**: published reads use a public/delivery token; drafts only for editor requests with a verified signature.
5. **Verify by API and in a browser**, in both languages, before saying it works. State plainly what you could not test (anything behind the
   CMS login).
6. **Outward-facing actions need the user's go-ahead**: creating a public GitHub repo was blocked by the permission classifier until the
   user confirmed visibility; do not work around a denial.
7. Update the matching CMS skill and these notes with what you learn, as you go.
