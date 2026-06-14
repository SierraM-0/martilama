# Hand-built static site generator — design

**Date:** 2026-06-14
**Status:** Approved for planning
**Goal:** Rebuild `martilama.com` from Astro to a from-scratch static site
generator in plain Node.js — owning the build/templating/routing ourselves,
while keeping focused single-job libraries for commodity work (markdown,
syntax highlighting, image resizing, OG rasterization).

## Motivation

Replace the Astro framework with a hand-built pipeline to (a) own and
understand the entire build, and (b) produce a clean, well-structured
static site generator that demonstrates real engineering judgment — the
interesting architectural parts written by hand, commodity leaf-node jobs
delegated to libraries. Output and deployment are unchanged: a static
`dist/` served by Cloudflare Pages at the existing domain/repo.

## Decisions (locked)

- **Dependency line:** No site framework. Focused libraries allowed for
  leaf jobs only (markdown, shiki, sharp, satori/resvg, sanitize-html).
- **Templating:** Tagged template literals — components are synchronous
  `data → string` functions using an `html`` `` helper that auto-escapes
  interpolations. No build step for templates, no Preact/JSX.
- **Image optimization:** KEEP. Build-time resize/convert/hash via `sharp`.
- **View Transitions:** KEEP, via CSS-only cross-document view transitions
  (`@view-transition { navigation: auto; }`). No hand-written client router.
  Graceful degradation to normal page loads where unsupported.
- **Dev workflow:** Build-only. `node build.js → dist/`. Preview with any
  external static server. No watch/live-reload tooling in the repo.
- **Build/routing structure:** Option B — a single explicit `build.js`
  orchestration that reads top-to-bottom as the recipe for the site.
  Two seams kept so a later move to per-page modules (Option C) is a
  mechanical refactor, not a rewrite:
  1. `writePage(path, html)` is the single output choke point.
  2. Page-specific logic lives in callable functions, never inline in
     the build loop.

## Core principle

**Rendering is synchronous; all async I/O happens before rendering.**
`build.js` performs slow async work first (read markdown, render to HTML,
optimize images into a manifest), then calls synchronous component
functions with the prepared data. No `await` inside templates/components.

## Directory layout

```
site/
├── build.js                 # Option B orchestration (the recipe)
├── lib/
│   ├── html.js              # html`` tagged helper + escape + raw()
│   ├── markdown.js          # unified pipeline (remark/rehype/sidenotes/shiki)
│   ├── images.js            # sharp resize → hashed file → manifest entry
│   ├── writePage.js         # single output choke point → dist/
│   ├── posts.js             # read content/blog, parse frontmatter, render, sort
│   ├── rss.js               # build rss.xml string
│   └── sitemap.js           # build sitemap.xml string
├── components/              # Nav.js Footer.js Logo.js PostCard.js Photo.js ThemeToggle.js
├── layouts/                 # BaseLayout.js PostLayout.js
├── pages/                   # home.js about.js work.js blog-index.js post.js notFound.js
├── content/blog/*.md        # unchanged
├── public/                  # static passthrough: favicon.svg, fonts, robots.txt, client JS
├── styles/global.css        # unchanged (+ @view-transition rule)
├── og/                      # card.js + fonts (satori/resvg, ported as-is)
├── plugins/rehype-sidenotes.js   # unchanged
└── test/                    # node:test
```

## Data flow (build.js, top to bottom)

1. Clean `dist/`.
2. `posts = await loadPosts()` — read `.md`, parse frontmatter, render body
   to HTML string, compute read-time; return sorted `{ slug, data, html }`.
3. `img = await optimizeImages(...)` — sharp resizes referenced images into
   `dist/_assets/<name>.<hash>.webp` (+ sizes); returns a `{src → {src,
   srcset, width, height}}` manifest.
4. Copy `public/` and `styles/global.css` into `dist/`.
5. Render pages (SYNC) via `writePage`:
   - `/` → `Home({ posts, img })`
   - `/about` → `About({ img })`
   - `/work` → `Work()`
   - `/blog` → `BlogIndex({ posts })`
   - loop posts → `/blog/<slug>` → `Post({ post, img })`
6. Generate endpoints: per-post + default OG PNGs, `rss.xml`, `sitemap.xml`,
   `404.html`.

## Subsystem details

### Templating (`lib/html.js`)
`html`` `` joins static strings with rendered interpolations. Interpolations
are escaped by default; arrays are joined; `raw(str)` opts out (used for
nested component output and rendered markdown). ~20 lines. Closes the XSS
hole a plain template literal would leave open.

Components/layouts become sync functions returning strings — near 1:1 with
the current `.astro` files (frontmatter logic above the return, markup in
the template). Nested components are called as functions and pass through
via `raw`.

### Markdown (`lib/markdown.js`)
Existing unified stack moves over verbatim:
`remark-parse → remark-gfm → remark-rehype → rehype-sidenotes →
@shikijs/rehype → rehype-stringify`. Shiki uses the same dual rose-pine
themes with `defaultColor:false` (CSS-var output switched by `data-theme`).
Frontmatter parsed with `gray-matter` (leaf lib).

### Images (`lib/images.js`)
Build-time `sharp`. Runs BEFORE rendering and returns a manifest the sync
components look up. Emits resized, modern-format, content-hashed files —
same effective output as Astro `<Image>`. Images inside markdown handled by
a small rehype step calling the same optimizer.

### Client JS & View Transitions
- Theme toggle, reading-progress bar, local clock: plain DOM JS, moved into
  `public/`. Simplified — drop the `astro:page-load`/`astro:after-swap`
  router plumbing; use standard `DOMContentLoaded`.
- View Transitions: CSS `@view-transition { navigation: auto; }` in
  `global.css`. ~3 lines, no router. Degrades gracefully.

### Fonts
Today the web fonts (Fraunces, Newsreader, JetBrains Mono) are pulled in via
`@fontsource-variable/*` npm imports in the layout. In the hand-built version
the `.woff2` files are self-hosted under `public/fonts/` and declared with
`@font-face` in `global.css`, removing the npm font packages. The OG `.ttf`
files under `og/fonts/` already exist as files and are unaffected.

### Endpoints
- **OG images:** `og/card.js` (satori + resvg) ported unchanged, including
  the pre-rasterized badge PNG fix. Build loops posts → PNG → `writePage`;
  plus `/og-default.png`.
- **RSS:** `lib/rss.js` (~25 lines) builds the XML; same fields as today
  (title, description, pubDate, link, sanitized full HTML content). Keeps
  `sanitize-html` and root-relative → absolute URL rewriting.
- **Sitemap:** `lib/sitemap.js` (~15 lines) loops output paths → `sitemap.xml`.
- **404:** `pages/notFound.js` → `dist/404.html` (Cloudflare serves it).

### Testing (`node:test`)
- `rehype-sidenotes` test ports verbatim.
- Add unit tests for new pure helpers: `html` escaping/raw behavior,
  frontmatter parsing.

## Deployment
- Cloudflare build command: `astro build` → `node build.js`. Output dir
  stays `dist/`. Domain, repo, redirects unchanged.
- `package.json`: remove Astro + `@astrojs/*` + `@fontsource-variable/*`
  (web fonts become self-hosted `.woff2` under `public/fonts/`). Add `sharp`,
  `@shikijs/rehype`, `gray-matter`. Move `unified`/`remark-*`/`rehype-*` from
  dev to prod.

## Non-goals (YAGNI)
- No dev server / watch / live-reload.
- No client-side router / SPA navigation.
- No file-based routing layer (Option A) or page-module collection
  (Option C) — B only, with seams for a later C migration.
- No new page types (tags, pagination, archives) in this rebuild — feature
  parity with the current site only.

## Migration sequencing (for the plan)
Rebuild to **full feature parity** with the current Astro site, verified
page-by-page against screenshots, then swap the Cloudflare build command in
a single cutover. Keep the Astro setup intact until parity is proven.
