# Design: martilama.com — personal site

Date: 2026-06-03
Author: marti (with Claude)
Status: Approved — pending implementation plan

## 1. Goal & feel

A single warm-but-minimal personal site that brings together:

- the existing blog,
- a lightweight career page,
- a human "About" page with photos.

Visually it re-creates the look and feel of the **tabi** Zola theme (clean
centered column, light/dark, one warm accent), but is built from scratch as the
author's own **Astro** components — no upstream theme dependency. Writing voice
and visual restraint match the existing blog: calm, plain, first-person
("Writing about life and my small opinions").

## 2. Stack & tooling

- **Astro** (latest), static output (`output: 'static'`).
- Pure Astro components — **no React/Vue/other UI framework** (keeps it lean and
  JS-light).
- **Node + npm** toolchain. `package.json` and lockfile committed to the repo.
- Integrations, kept minimal:
  - `@astrojs/rss` — generates the feed.
  - `@astrojs/sitemap` — sitemap.
  - built-in `astro:assets` — image optimization.
- **Content:** Markdown content collections (plain `.md`; no MDX — not needed for
  this writing).
- **Styling:** plain CSS (light SCSS acceptable) using CSS custom properties for
  theming, mirroring how tabi implements skins. No Tailwind — the author writes
  the styles.
- **Light/dark + warm accent:** CSS custom properties plus a tiny inline
  vanilla-JS toggle that respects `prefers-color-scheme` and remembers the user's
  choice. No framework.

## 3. Information architecture (routes)

```
/                 Home — portrait + short intro + latest posts (tabi homepage style)
/about            Warm bio + candid photos
/work             Lightweight career page (what you do + highlights + LinkedIn/CV link)
/blog             Post list (reverse-chronological)
/blog/<slug>      Single post  ← the 2 existing posts migrate here
/rss.xml          Feed (replaces atom.xml)
404
```

- **No tags / taxonomies** anywhere (explicitly removed at author's request — no
  tag chips, no tag pages, no tag field in the content schema).
- `blog.martilama.com` issues a **301 redirect** to `martilama.com/blog`.
- The old `atom.xml` feed path redirects to `/rss.xml` so existing subscribers
  are not broken.

## 4. Visual design (the "like tabi" part)

- **Layout:** single centered column (~720px text measure). Top nav:
  `blog · work · about · github`. Minimal footer carrying
  `© $YEAR marti :: Forever building.` and social icon(s).
- **Typography:** one clean sans for UI/body (system stack or Inter), monospace
  for code — tabi's flavor. Comfortable line-height, left-aligned text.
- **Color / skin:** dark + light themes. A single **warm accent**
  (amber/terracotta direction rather than tabi's default teal). Backgrounds stay
  calm and neutral. Exact hue may be tuned during implementation; scaffold can
  start neutral and be dialed in.
- **Warmth levers:** a **portrait** of the author on the homepage beside the
  intro; 1–3 **candid photos** woven into the About page; warm accent plus
  generous whitespace. Everything else stays minimal so the site reads credible,
  not busy.

## 5. Components (Astro)

Small, single-purpose, easy to edit:

- `BaseLayout.astro` — head, nav, footer, theme toggle.
- `PostLayout.astro` — single-post wrapper.
- `PostCard.astro` — blog list item.
- `Nav.astro`, `Footer.astro`, `ThemeToggle.astro`.
- `Photo.astro` — wraps `astro:assets` `<Image>` for optimized, lazy, responsive
  photos.
- `Prose.astro` — post body typography.

## 6. Content model

- `src/content/blog/*.md` — collection with a typed schema:
  `title`, `description`, `date`, optional `cover`. **No `tags` field.**
- The current blog frontmatter (`+++` TOML, includes `[taxonomies] tags`)
  converts to Astro's `---` YAML, and the `tags` lines are stripped during
  migration.
- `about`, `work`, and the home intro: authored as `.astro` pages (or Markdown)
  with the author's copy and photos.

## 7. Photos / images

All photos go through `astro:assets` `<Image>`: automatic resizing, `srcset`,
lazy-loading, modern formats. The author drops full-resolution files into
`src/assets/`; the build optimizes them. This is the concrete advantage Astro
brings to the "pictures of me" goal over the previous Zola setup.

## 8. Migration & feeds

- Move the 2 existing posts (`hello-world`,
  `a-keyboard-headphones-a-book`) into the new collection. Preserve dates and
  slugs so blog URLs match, keeping old links alive behind the redirect. Strip
  tags.
- `@astrojs/rss` generates `/rss.xml`. Redirect old `atom.xml` to it.

## 9. Deploy

- New Cloudflare project (Pages / Workers Builds) connected to the new GitHub
  repo. Build command `npm run build`, output directory `dist/`.
- Simpler than the current Zola setup — no `build.sh` fetching a Zola binary;
  Cloudflare supports Astro natively.
- Same git-push-to-deploy flow; pull requests still get preview URLs.

## 10. Repo & location

- New repo (Astro project) at `~/Documents/Yggdrasil/Asgard/Bragi/site/`
  (Bragi = the words/publishing domain of the Yggdrasil tree — fits).
- Pushed to GitHub as `SierraM-0/site`.
- The old Zola `blog` repo (`Asgard/Bragi/blog/`) is kept as an archive after
  migration — not deleted.

## 11. Out of scope for v1 (YAGNI — addable later without redesign)

Client-side search, comments, post series, multilingual, formal case studies,
analytics. The structure leaves room for all of these.
