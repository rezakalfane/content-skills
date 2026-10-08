---
name: my-vercel
description: Create, configure, deploy and debug Vercel projects for the Commerce B2B storefronts (Next.js) with the `vercel` CLI and `gh`: private GitHub repo, link a project in the team scope, set environment variables non-interactively (the `--yes` trap that stores EMPTY values), read-only vs admin keys, production deploys (the agent cannot run them; the user runs them with `!`), reading failed build logs, verifying the live site with curl, toggling a debug flag. Use whenever the user mentions Vercel, a deployment, `vercel env`, a Vercel project, "deploy", "production", a build failing on Vercel, or putting a storefront online.
---

# Vercel: put a storefront online

Status legend: VERIFIED = run for real in this project (elastic-commerce-b2b, 8 Oct 2026, Vercel CLI 56.3.1). DOCS = from the CLI help, not run.

Team scope used everywhere: `rza-kalfanes-projects` (pass `--scope rza-kalfanes-projects`). `vercel whoami` prints the user (`rezakalfane`), `gh auth status` the GitHub account. Both were already logged in. VERIFIED.

## Who may do what (read this first)
- **Production deploys are blocked for the agent.** The permission classifier denies `vercel deploy --prod` ("Production Deploy"), also when it is chained with other commands. Do not look for another way (no empty-commit push to trigger one). Do all the preparation, then give the user the command to run in the prompt with the `!` prefix:
  `! cd <project> && vercel deploy --prod --yes --scope rza-kalfanes-projects`
  and wait. The user's run output arrives in the conversation (URL, `readyState`, alias).
- Allowed and used: `vercel link`, `vercel env add/ls/pull`, `vercel ls`, `vercel inspect --logs`, `vercel git connect`, `gh repo create`, `git push`.
- Setting a variable changes nothing live until the **next deployment**. Say so, and ask the user to redeploy.

## New project, in order (VERIFIED)
1. **Before the first push, scan for secrets** and make sure `.env*` is gitignored (except `.env.example`): `git ls-files | grep -iE "\.env($|\.local)|secret|\.pem"` must print nothing; `git grep -nE "ApiKey [A-Za-z0-9=]{20,}|gho_"`.
2. GitHub, private: `gh repo create rezakalfane/<name> --private --source=. --remote=origin --description "..."` then `git push -u origin main`. A copied project starts with a fresh `git init` (no history, no `.vercel`, no `.env.local`).
3. Link (creates the Vercel project if the name is new): `vercel link --yes --project <name> --scope rza-kalfanes-projects`. **Side effect: it rewrites `.env.local`, adding `VERCEL_OIDC_TOKEN`.** Existing values stay; check afterwards with names only: `awk -F= '/^[A-Z_]+=/{print $1, ($2==""?"EMPTY":"set")}' .env.local`. `.vercel/` is gitignored.
4. Variables (next section), then the user deploys.
5. `vercel git connect https://github.com/rezakalfane/<name> --yes --scope ...`. It answers "already connected" when a push has linked it; from then on a push to `main` deploys production.

## Environment variables (VERIFIED, with a trap)
```
# non-secret: pass the value
vercel env add NAME production --value "$VALUE" --force --yes --scope rza-kalfanes-projects
# secret: stdin, never on the command line, never echoed
printf %s "$VALUE" | vercel env add NAME production --sensitive --force --yes --scope rza-kalfanes-projects
```
- **`--yes` is required.** The CLI is non-interactive when an agent is detected. Without `--yes`, `vercel env add` exits 0 and prints "Common next commands", but the value is stored EMPTY. This broke the first build here (`getaddrinfo ENOTFOUND .cdn.content.amplience.net`: an empty hub name).
- `--force` overwrites an existing variable for that target. Without it, a second add of the same name fails.
- Read values from `.env.local` without printing them: `awk -F= -v k=NAME '$1==k{print substr($0,index($0,"=")+1)}' .env.local | tr -d '\r\n'`.
- **You cannot read production values back.** This project hides all of them: `vercel env pull` writes `"[SENSITIVE]"` for each, so a length check shows the same number for every variable and proves nothing. The only real test is a deployment (build log + curl). `vercel env ls production` shows names, "Encrypted", and age.
- A variable set only for `production` does not exist in Preview or Development builds.
- Leave a variable **unset** rather than empty when "empty = default" would be ambiguous (e.g. `AMPLIENCE_DELIVERY_HOST`: unset = published content). Do not set the one-off loader token (`CONTENT_EXPORT_TOKEN`): when it is unset the export route 404s, which is what a deployment wants. Never put an admin or write-capable key in Vercel.
- Debug flag example: `SEARCH_DEBUG=1` shows the storefront's search debug panel in production (it is public: anyone can read the raw search requests and responses). Turn off with `vercel env rm SEARCH_DEBUG production --yes` and redeploy.

## Keys for a deployment
Give a deployment a **read-only** key, scoped to the indices it reads (Elasticsearch: `read` on `products` and `content`), and keep the admin key only on the machine that loads data. A key created with an API key cannot carry privileges ("creating derived api keys requires an explicit role descriptor that is empty"), so the user creates it in Kibana (Dev Tools `POST /_security/api_key`). Name the variables by role (`ES_ADMIN_API_KEY` vs `ES_READONLY_API_KEY`) and make the storefront read only the read-only one, so it cannot fall back to admin. See the `elasticsearch` skill.

## Deploying by push, and rotating a secret (VERIFIED)
- With the GitHub repo connected, **a push to `main` starts a production deployment on its own** (the classifier blocks `vercel deploy --prod` for the agent, not `git push`). So: set or change the Vercel variables BEFORE pushing, and every push then carries them. A variable changed after a deployment only takes effect on the next one.
- A deployment takes about a minute. `vercel ls` output is awkward to parse; **poll the behavior instead** with a small curl loop that checks the thing you changed (a page count, an endpoint, a status) and stops when it is right.
- **Rotating or deleting a key or token that production uses:** create the new one, set it in Vercel (`vercel env add ... --sensitive --force --yes`), let a deployment pick it up, verify, and only then delete the old one. Deleting first made every production search fail with 401 until a redeploy ("0 products" on the listing). Ask the user to tell you BEFORE they delete a key.
- After any change to infrastructure (index alias, key, environment), test the **non-default paths** on the live site, not just the home page: other languages, the type-ahead, features behind a cookie, and the real read-only credentials.

## When a build fails (VERIFIED)
```
vercel ls --scope rza-kalfanes-projects                 # status of the latest deployments, with their URLs
vercel inspect <deployment-url> --logs --scope ...      # the build log; read the end first
```
- A Next.js page that is prerendered at build time (`Generating static pages`) needs its variables at build time. Many `fetch failed` lines followed by `Error occurred prerendering page "/en"` almost always mean a missing or empty variable; the hostname in `ENOTFOUND` shows which one.
- A failed deployment leaves the previous production alias in place.
- Build caches speed up later builds (32s cold, 9s warm here).

## Verify the live site (VERIFIED)
The alias is `https://<project>.vercel.app`. Test with curl, not just the build status:
- pages: `curl -sL -o /tmp/p.html -w "%{http_code}" URL` for the home page, a listing, a search (`?q=`), the other language, content pages;
- API routes (e.g. `/api/suggest?q=exi&locale=en`) return JSON you can check;
- routes that must be off return 404 (`/api/content/export`);
- no secret in the HTML: `grep -E "ApiKey [A-Za-z0-9=]{20,}"` finds nothing;
- React splits text with comment nodes (`Search debug · <!-- -->0`), so match on the words, not the whole label.

## Project facts
- Vercel projects here: `elastic-commerce-b2b` (Elasticsearch search, https://elastic-commerce-b2b.vercel.app), `bloomreach-commerce-b2b` (Bloomreach), and the original `amplience-commerce-b2b`; all in `rza-kalfanes-projects`, deployment protection off (Amplience loads the site in an iframe).
- Production reads published Amplience content; there is no Preview setup in the copies.
- The CLI printed "Vercel CLI 56.3.1" locally but builds ran 62.x; ignore the difference.

## TODO (not done)
Custom domain, Preview/Development variables, a Cron or webhook that reloads the search index when BigCommerce or Amplience content changes, an alert on failed deployments.
