# martilama.com

Personal site built with [Astro](https://astro.build/) — home, about, a
lightweight work page, and the blog. Lives under
`Yggdrasil/Asgard/Bragi/site/`. Deployed to Cloudflare, live at
[martilama.com](https://martilama.com).

## Develop

```bash
npm install
npm run dev      # local dev server
npm run build    # static build to ./dist
npm run preview  # preview the built site
```

## Content

- Posts: Markdown files in `src/content/blog/`. Frontmatter: `title`,
  `description`, `date`, optional `cover`. No tags.
- Photos: drop full-res files in `src/assets/` and import them; the build
  optimises them via `astro:assets`. Replace `src/assets/portrait.png` with a
  real photo.

## Deploy (Cloudflare)

- Connect this GitHub repo (`SierraM-0/site`) to a Cloudflare Pages/Workers
  Builds project.
- Build command: `npm run build`. Output directory: `dist`.
- `public/_redirects` redirects the old `/atom.xml` to `/rss.xml`.
- **Subdomain redirect:** configure a Cloudflare redirect rule so
  `blog.martilama.com/*` → `https://martilama.com/blog/$1` (301). This is a
  dashboard/DNS-level rule, not part of the static build.

## Migration note

Supersedes the old Zola blog at `Asgard/Bragi/blog/`. That repo is kept as an
archive; post slugs/dates were preserved so existing links keep working behind
the subdomain redirect.

## Problem reports

Visitors can click "report a problem" in the footer to send a replay of about
their last 3 minutes on the site, plus the console log. Reports are viewed at
`reports.martilama.com`. Design: `docs/superpowers/specs/2026-10-08-problem-report-replay-design.md`.

- Site half: `public/js/report.js`, `public/js/report-buffer.js`, `public/js/vendor/`.
- Worker half: `reports/` (its own `package.json`; deployed separately).

### Run locally

```bash
cd reports && cp .dev.vars.example .dev.vars && npx wrangler dev   # http://localhost:8787
npm run build && npm run preview                                    # http://localhost:4321
```

On `localhost` the site uploads to `http://localhost:8787/ingest`, and the
viewer skips the Access check (`DEV_NO_ACCESS=1` is honoured on localhost only).

### First deploy

1. `cd reports && npx wrangler r2 bucket create martilama-reports`
2. In the Cloudflare dashboard, R2 → `martilama-reports` → Settings → Object
   lifecycle rules: delete objects with prefix `reports/` after 30 days.
3. `npx wrangler deploy` (attaches the `reports.martilama.com` custom domain).
4. Zero Trust → Access → Applications → add a self-hosted application for
   `reports.martilama.com` with an Allow policy for your own login.
5. Add a second self-hosted application for `reports.martilama.com/ingest`
   with a single **Bypass** policy for Everyone.
6. Copy the first application's **Application Audience (AUD) tag** and your
   team domain (`<team>.cloudflareaccess.com`) into `ACCESS_AUD` and
   `ACCESS_TEAM_DOMAIN` in `reports/wrangler.toml`, then `npx wrangler deploy`
   again. Until both are set the viewer answers 403 to everyone.
7. Merge the site half to `main` and push.

### Updating rrweb

The three rrweb bundles are vendored at 2.1.7. To update, re-run the `npm pack`
commands in `docs/superpowers/plans/2026-10-08-problem-report-replay.md`
(Tasks 2 and 7) with the new version, for all three together.

`reports/wrangler.toml` has a `[dev]` block pinning the local host to
`localhost:8787`; without it `wrangler dev` presents requests under the
production hostname and the local viewer answers 403.
