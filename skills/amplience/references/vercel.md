# Vercel setup for Production / Preview on Amplience

- `vercel project add <name>`, `vercel link --yes --project <name>`; **set the framework preset to Next.js** (`PATCH /v9/projects/<name> {"framework":"nextjs"}` via `vercel api`): a CLI-created project is "Other" and
  every route 404s even though the build succeeds.
- Env per scope (`printf %s "$VALUE" | vercel env add NAME production|preview --force`): `AMPLIENCE_HUB_NAME` in both; `AMPLIENCE_DELIVERY_HOST=<id>.staging.bigcontent.io` and `AMPLIENCE_TIME_TOKEN` in **Preview only**;
  commerce tokens in both. **Never the PAT.** `vercel link` rewrites `.env.local` (check your keys survive).
- Disable Vercel Authentication for previews (`{"ssoProtection": null}`): Amplience frames the staging site. Production domain is public anyway.
- Git: `gh repo create <owner>/<name> --private --source . --push`, push `main` (Production) and `staging` (stable Preview URL `<project>-git-staging-<team>.vercel.app`), `vercel git connect <url>`.
  **Commits must be authored by the GitHub account** (use `<id>+<login>@users.noreply.github.com`): builds for commits with an unlinked work email never started (status UNKNOWN).
- `X-Content-Environment: production|preview` response header (set in next.config) makes the active mode visible with one curl.
- Next.js 16: `proxy.ts` (not middleware.ts), `params`/`searchParams` are Promises, `PageProps<"/[locale]">` types exist after `next typegen`/dev. Set `export const maxDuration = 300` for background work in `after()`.
- Log a deployed problem: `vercel logs -b staging -j`; console output of `after()` tasks was not visible there, so test deployed behaviour with a Playwright script against the staging URL.
- `WARM_TOKEN` (Preview scope + GitHub secret `WARM_TOKEN` via `gh secret set`) protects `/api/warm`; the Action in `templates/github-actions/` calls it after each Preview deploy.
