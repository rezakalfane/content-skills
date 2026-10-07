# content-skills

Claude Code skills for headless-CMS work, written while building the same Commerce B2B storefront (Next.js + BigCommerce) on four CMSs.

| Skill | What it is |
|---|---|
| [`cms-storefront-port`](skills/cms-storefront-port) | The playbook for porting the storefront to another CMS: order of work, the CMS boundary, BigCommerce French content and translated URLs, delivery (GitHub, Vercel), pitfalls. Start here. |
| [`contentful`](skills/contentful) | Contentful: content model, locales, seeding via the Management API, Delivery/Preview APIs, Live Preview with a typed-edit overlay. Verified on a real space. |
| [`contentstack`](skills/contentstack) | Contentstack: stack, content types, entries, Live Preview / Visual Builder, publishing rules. |
| [`storyblok`](skills/storyblok) | Storyblok: components, stories, field-level translation, Management API, Visual Editor bridge. |
| [`amplience`](skills/amplience) | Amplience Dynamic Content: schemas, content types, delivery keys, virtual staging, visualizations, time-travel preview. |
| [`switchable-cms-storefront`](skills/switchable-cms-storefront) | One app that switches CMS at runtime: provider contract, lazy registry, proxy resolution order and gates, frame-ancestors union, switcher UX, parity testing. |

The reference implementations are the repositories `contentful-commerce-b2b`, `storyblok-commerce-b2b`, `contentstack-commerce-b2b` and `amplience-commerce-b2b` (`rezakalfane` on GitHub).

## Use

Claude Code reads skills from `~/.claude/skills/<name>`. Clone this repository and link each skill:

```bash
git clone git@github.com:rezakalfane/content-skills.git ~/Workspaces/content-skills
for s in ~/Workspaces/content-skills/skills/*/; do ln -s "$s" ~/.claude/skills/"$(basename "$s")"; done
```

The skills live here and `~/.claude/skills` holds symbolic links, so editing a skill updates the repository; commit and push to keep it.

## Rules the skills follow

- Credentials stay in `.env.local` (gitignored); scripts load and redact them, and values are never printed or asked for.
- Outward-facing actions (public repositories, pushes, deployments) need the user's go-ahead.
- Each skill records what turned out different from the first assumption, so they get more accurate with every project.
