# Delivery: GitHub, Vercel, docs, screenshots

## GitHub
`gh repo create <cms>-commerce-b2b --public --source . --remote origin --push --description "..."` **only after the user confirms visibility** (the first
attempt was denied by the permission classifier). Then `git push origin main:staging`. Keep `.github/workflows/sync-staging.yml` (rebuilds `staging` from `main`
with an empty commit so Vercel builds it). Commit with the `Co-Authored-By` trailer from the session reminder. Scan the tree for every value of `.env.local`
before the first push (`grep -rIlF <value>`; print only counts).

## Vercel
```bash
vercel link --yes --project <cms>-commerce-b2b
# per variable and scope (production, preview, development), value piped from .env.local, never printed:
grep "^NAME=" .env.local | cut -d= -f2- | sed 's/[[:space:]]*#.*$//' | tr -d '\n' | vercel env add NAME production --sensitive --force
vercel api /v9/projects/<project> -X PATCH --input - <<< '{"ssoProtection": null}'   # previews public, like the other projects
vercel git connect <repo-url>        # after the build works; prints nothing when already connected; re-run to see status
```
Production reads published content with the public/delivery token; the preview token is for editor requests. Check `vercel env pull` lengths (not values) to confirm
nothing is empty. Verify with `scripts/urltest.py https://<project>.vercel.app` and the staging alias.

## Docs set (rewrite per CMS)
README, `docs/README.md` (index + vocabulary), `architecture.md` (+ regenerate `images/architecture.png` from `images/source/architecture.html` with Playwright at 2000px wide),
`<cms>.md`, `visual-editor.md`, `i18n.md`, `implementation.md`, `operations.md`, `seeding.md`, `decisions.md`, `bigcommerce.md` (BigCommerce section is shared), `design-system.md`, `HISTORY.md`.
Write facts you verified; mark what you could not (anything behind the CMS login).

## Screenshots
Ask the user for the CMS app screens (content model, content list, assets, editor in both languages, a block selected). macOS screenshot names contain a narrow no-break space before
"AM": match with a glob. Mask the browser address bar (it shows space/project and entry ids) before committing to a public repo. Delete the previous CMS's `*-` screenshots,
and retake the French storefront images (`i18n-en-fr.jpg`, `home-fr.jpg`) from the new site. Run the link/unused-image checker from the docs step.
