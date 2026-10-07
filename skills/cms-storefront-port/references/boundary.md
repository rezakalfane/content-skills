# The CMS boundary

## Files that change per CMS
| File | Role |
|---|---|
| `lib/<cms>.ts` | client(s), draft vs published, preview signature check, language map, live-edit cache, mapping helpers (`asset`, `link`, `lines`, `html`, `editTags`...) |
| `lib/blog.ts`, `lib/site.ts` | queries + mappers into the shapes below (authors, posts, listing, FAQs, guides, spotlights, nav, announcement, pages) |
| `components/edit-support.tsx` (+ client SDK component) | loads the editing SDK/bridge only for editor requests |
| `lib/edit.ts` | `Tags` / `Tagged` types for `$` edit attributes |
| `next.config.ts` | CSP `frame-ancestors`, `images.remotePatterns` (CMS asset host + BigCommerce CDN) |
| `proxy.ts` | locale routing, editor URL rewrites (`/home`, `/faqs/...`, `/authors/...`, `/spotlights/...`, `/settings/...`) |
| `scripts/seed/*` | model, seed, editor config |
| `.github/workflows/sync-staging.yml` | keep `staging` equal to `main` (comment names the preview environment) |

Everything else (components, `lib/bigcommerce.ts`, `lib/i18n.ts`, pages, docs on design/BigCommerce) is CMS-agnostic.

## Shapes the pages read (keep them)
`Asset {uid,url,title?}`, `Link {title?,href?}`, `Author {uid,id,title,picture?,bio?}`, `Post {uid,id,title,url:'/blog/<slug>',date?,author?:Author[],
featured_image?,bodyHtml?,related_post?:Post[],seo?:{meta_title,meta_description}}`, `HeroBanner {title,banner_image?,banner_description?,call_to_action?}`,
`ListingPage {id,title,hero?,search_placeholder?,search_button_label?,featured_title?,featured_posts,view_all_label?,related_title?,related_posts}`,
`Faq {uid,id,title,topic,sort_order?,is_featured?,answerHtml}`, `Guide {uid,id,title,url:'/guides/<slug>',summary,hero_image?,audience?,read_minutes?,steps?,
checklist?:string[],recommended_bc_products?:number[],recommended_skus?:string[],related_faqs?:Faq[],author?:Author[]}`, `Spotlight {uid,id,title,
bc_product_id:number,bc_sku?,tagline,key_features?:string[],use_cases?,badge?,editorial_image?,is_featured?}`, `Navigation {header_links,footer_columns,
contact,legal_text}`, `Announcement {uid,message,cta?,style,audience,starts_at?,ends_at?,is_active?}`, `PageEntry/HomePage {uid,id,title,description?,hero?:HeroBanner[],
image?,rich_text?:html,blocks?:{block:{title,copy:html,image?,layout?}}[]}`. Every mapped entity has `$` (edit attributes, empty outside the editor).
Amplience used camelCase variants (`lib/content.ts`); either works as long as the pages and the mapper agree.

## Content model to recreate (9 types + 6 blocks)
`page` (title, description, hero block, image, intro rich text, feature blocks, SEO), `blog_listing_page`, `blog_post` (title, author ref, date, featured image,
rich text body, related post ref, archived flag, SEO), `author` (name, picture, bio), `faq` (question, rich-text answer, topic enum, sort order, featured flag),
`buying_guide` (title, summary, hero image, audience enum, read minutes, steps, checklist, recommended BC product ids + SKUs, related FAQ refs, author ref),
`product_spotlight` (title, **bc_product_id**, bc_sku, tagline, rich-text summary, key features, use cases, badge enum, image, featured), `announcement_bar`
(message, CTA label + href, style, audience, start/end, active), `site_navigation` (header links, footer columns with links, contact, legal).
Blocks: `hero_banner`, `feature_block`, `guide_step`, `use_case`, `nav_link`, `footer_column`. Localize every human-readable field; enums keep English values (mapped in
`lib/i18n.ts`); CTA is label + storefront path (the app adds `/fr`).
URL scheme: `/` home, `/faq`, `/guides` (index) + `/guides/<slug>`, `/blog` (index) + `/blog/<slug>`; authors/FAQs/spotlights/settings have no pages of their own.
