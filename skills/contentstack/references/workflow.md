# Environments, workflows and the review-before-live gate

## Environments

| Environment | Reads it | Notes |
|---|---|---|
| `production` | the live site | own delivery + preview tokens |
| `preview` | staging site (branch `staging`), local dev | all edits go here first |
| `local` | nothing | only a Live Preview base URL for localhost |

Delivery/preview tokens are per environment. Set each environment's Live Preview base URL per locale.

## The gate (workflow + publishing rule)

1. **Workflow** `POST /v3/workflows`: stages Draft → In review → Approved on the content types, branch `main`. Restrict the
   Approved stage's ACL to a role (`SYS_ACL.roles.uids`, `allow_all_users: false`); other stages open
   (`SYS_ACL.users.uids: ["$all"]`). `next_available_stages: ["$all"]`.
2. **Publishing rule** `POST /v3/workflows/publishing_rules` (not `publish_rules`): `workflow`, `environment` (UID of
   `production`), `workflow_stage` (the Approved UID), `branches`, `locales`, **explicit `content_types`** (`$all` is rejected),
   `actions: []` (all), `approvers: {users: [], roles: [<role uid>]}` (use a role UID; a user UID must be a real stack member),
   `disable_approver_publishing: false`.
3. **Baseline** existing live entries to Approved once, or the rule locks all of them:
   `POST /content_types/<ct>/entries/<uid>/workflow?locale=<code>` body
   `{"workflow": {"workflow_stage": {"comment": "...", "due_date": "", "notify": false, "uid": "<approved uid>"}}}`.
   Stages are **per locale**. New entries start in the first stage (Draft).
4. Publishing to `preview` has no rule, so the staging site always reflects what editors are checking.

Tested: Draft and In review are refused for `production`, allowed for `preview`; Approved is accepted; a management-token
script may update an Approved entry but may not move it out of Approved (Admin-only ACL).

### Limits to state honestly

- Editing an Approved entry does not reset its stage (checked at publish time). Habit: move it to In review while editing.
- One admin means self-approval; enable *Prevent self-approval* once there is a second approver.
- The management token (scripts) is a developer credential. Make `--approve` an explicit flag, never a side effect.
- Content only; code deploys are gated in GitHub (branch protection), not here. Releases bundle changes but do not block a
  direct publish, so a Release alone is not a gate.

## Staging site on Vercel

- `staging` branch rebuilt from `main` by a GitHub Action after each push (`git checkout -B staging origin/main`, **empty
  commit**, force-push). Vercel skips a branch tip it already built, hence the empty commit.
- Vercel *Preview* scope variables point at the `preview` environment; Production scope at `production`.
- Public staging: `vercel project protection disable --sso <project>` (Vercel adds `x-robots-tag: noindex`). Set the
  `preview` environment's Live Preview base URL to the stable branch URL.
- "Deployment is building" placeholders return HTTP 200: check the page title, not the status code.
- Confirm with `curl -sI <url> | grep -i x-content-environment`.

## Editor routine

Edit → publish to `preview` (both locales) → check staging in EN and /fr → set stage Approved → publish to `production` →
verify live.
