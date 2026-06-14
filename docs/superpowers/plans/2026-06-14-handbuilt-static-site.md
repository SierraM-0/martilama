# Hand-built Static Site Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Astro with a from-scratch Node.js static site generator that reproduces `martilama.com` at full feature parity, then cut Cloudflare over to it.

**Architecture:** A single explicit `build.js` orchestrates the build (Option B). Async I/O (markdown rendering, image optimization) runs first and produces plain data; synchronous component functions then turn that data into HTML strings via an `html`` `` tagged-template helper. `writePage(path, html)` is the single output choke point into `dist/`. The new hand-built code lives at the repo root and reads the existing shared inputs under `src/` (content, styles, og, plugins, assets) so Astro keeps working in parallel until a single cutover at the end.

**Tech Stack:** Node.js (ESM), `node:test`; leaf libraries — `unified`/`remark-*`/`rehype-*` (+ `rehype-raw`), `@shikijs/rehype`, `gray-matter`, `sharp`, `satori`/`satori-html`/`@resvg/resvg-js`, `sanitize-html`. CSS-only cross-document View Transitions.

**Parallel-build path convention:** Until the final cutover task, the generator reads shared inputs from their current `src/` locations: posts `src/content/blog/`, styles `src/styles/global.css`, OG `src/og/`, sidenotes plugin `src/plugins/rehype-sidenotes.js`, images `src/assets/`. New generator code (`build.js`, `lib/`, `components/`, `layouts/`, `pages/`, `public/`) lives at the repo root and does not touch the Astro `src/pages/*.astro` files.

---

## File Structure

**New files (repo root):**
- `build.js` — orchestration recipe
- `lib/html.js` — `html`` `` tagged helper, `raw()`, `escape()`
- `lib/writePage.js` — write one HTML string to `dist/<path>/index.html`
- `lib/markdown.js` — unified pipeline → HTML string
- `lib/posts.js` — load + parse + render + sort blog posts
- `lib/images.js` — `sharp` build-time optimizer + manifest
- `lib/rss.js` — build `rss.xml` string
- `lib/sitemap.js` — build `sitemap.xml` string
- `components/{Logo,ThemeToggle,Nav,Footer,Photo,PostCard}.js`
- `layouts/{BaseLayout,PostLayout}.js`
- `pages/{home,about,work,blogIndex,post,notFound}.js`
- `public/fonts/*.woff2` — self-hosted web fonts
- `public/js/{theme,progress,clock}.js` — client scripts
- `public/favicon.svg`, `public/robots.txt`
- `og/card.js` — ported from `src/og/card.ts`
- `test/{html,writePage,markdown,posts,images,rss}.test.mjs`

**Reused as-is (read in place until cutover):**
- `src/content/blog/*.md`, `src/styles/global.css`, `src/plugins/rehype-sidenotes.js`, `src/og/fonts/*.ttf`, `src/assets/portrait.png`

---

### Task 1: Project dependencies & skeleton

**Files:**
- Modify: `package.json`
- Create: `lib/`, `components/`, `layouts/`, `pages/`, `og/`, `public/fonts/`, `public/js/`, `test/` (directories)

- [ ] **Step 1: Update package.json dependencies**

Replace the `dependencies`/`devDependencies`/`scripts` blocks (keep `name`, `type`, `version`, `private`). Astro deps are left in place for now (Astro must keep building until cutover); the new deps are added alongside.

```json
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "build:hand": "node build.js",
    "preview:hand": "node serve.mjs",
    "test": "node --test"
  },
  "dependencies": {
    "@astrojs/rss": "^4.0.0",
    "@astrojs/sitemap": "^3.0.0",
    "@fontsource-variable/fraunces": "^5.2.9",
    "@fontsource-variable/jetbrains-mono": "^5.2.8",
    "@fontsource-variable/newsreader": "^5.2.10",
    "@resvg/resvg-js": "^2.6.2",
    "@shikijs/rehype": "^1.0.0",
    "astro": "^5.0.0",
    "gray-matter": "^4.0.3",
    "rehype-raw": "^7.0.0",
    "rehype-stringify": "^10.0.1",
    "remark-gfm": "^4.0.1",
    "remark-parse": "^11.0.0",
    "remark-rehype": "^11.1.2",
    "sanitize-html": "^2.17.4",
    "satori": "^0.26.0",
    "satori-html": "^0.3.2",
    "sharp": "^0.33.0",
    "unified": "^11.0.5",
    "unist-util-visit": "^5.1.0"
  }
```

- [ ] **Step 2: Install**

Install the new packages at their current latest (so versions are correct rather than guessed), which also writes them into `package.json`:

Run:
```bash
cd ~/Documents/Yggdrasil/Asgard/Bragi/site
npm install sharp @shikijs/rehype gray-matter rehype-raw
```
Expected: resolves and installs all four; exit 0. (The version ranges shown in Step 1 are indicative — let npm pin the real ones.)

- [ ] **Step 3: Create directory skeleton**

Run: `mkdir -p lib components layouts pages og public/fonts public/js test`
Expected: directories created.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add hand-built generator dependencies"
```

---

### Task 2: `lib/html.js` — tagged template helper

**Files:**
- Create: `lib/html.js`
- Test: `test/html.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/html.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escape } from '../lib/html.js';

test('escapes interpolated values', () => {
  assert.equal(html`<p>${'<script>'}</p>`, '<p>&lt;script&gt;</p>');
});

test('raw() passes through unescaped', () => {
  assert.equal(html`<div>${raw('<b>hi</b>')}</div>`, '<div><b>hi</b></div>');
});

test('arrays are joined without separator', () => {
  assert.equal(html`${[raw('<a>'), raw('<b>')]}`, '<a><b>');
});

test('nested html() output is not double-escaped', () => {
  const inner = html`<span>${'a&b'}</span>`;
  assert.equal(html`<p>${raw(inner)}</p>`, '<p><span>a&amp;b</span></p>');
});

test('escape() handles all five entities', () => {
  assert.equal(escape(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/html.test.mjs`
Expected: FAIL — cannot find module `../lib/html.js`.

- [ ] **Step 3: Implement**

```js
// lib/html.js
const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ENTITIES[c]);

const RAW = Symbol('raw');
export const raw = (value) => ({ [RAW]: true, value: String(value) });

function render(value) {
  if (value == null || value === false) return '';
  if (Array.isArray(value)) return value.map(render).join('');
  if (typeof value === 'object' && value[RAW]) return value.value;
  return escape(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += render(values[i]) + strings[i + 1];
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/html.test.mjs`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/html.js test/html.test.mjs
git commit -m "feat: html tagged-template helper with auto-escaping"
```

---

### Task 3: `lib/writePage.js` — output choke point

**Files:**
- Create: `lib/writePage.js`
- Test: `test/writePage.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/writePage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writePage } from '../lib/writePage.js';

test('writes "/" to index.html at dist root', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await writePage('/', '<html>home</html>', dir);
  assert.equal(await fs.readFile(path.join(dir, 'index.html'), 'utf8'), '<html>home</html>');
});

test('maps "/about" to about/index.html', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await writePage('/about', 'x', dir);
  assert.equal(await fs.readFile(path.join(dir, 'about', 'index.html'), 'utf8'), 'x');
});

test('writes exact filenames (ending in extension) verbatim', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await writePage('/rss.xml', '<rss/>', dir);
  assert.equal(await fs.readFile(path.join(dir, 'rss.xml'), 'utf8'), '<rss/>');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/writePage.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// lib/writePage.js
import fs from 'node:fs/promises';
import path from 'node:path';

export const DIST = path.resolve('dist');

// A path ending in `.<ext>` is written verbatim; otherwise it's a route and
// gets `/index.html` so clean URLs work on static hosting.
export async function writePage(route, contents, dist = DIST) {
  const rel = route.replace(/^\//, '');
  const isFile = /\.[a-z0-9]+$/i.test(rel);
  const target = isFile ? path.join(dist, rel) : path.join(dist, rel, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
  return target;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/writePage.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/writePage.js test/writePage.test.mjs
git commit -m "feat: writePage output choke point"
```

---

### Task 4: `lib/markdown.js` — unified render pipeline

**Files:**
- Create: `lib/markdown.js`
- Test: `test/markdown.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/markdown.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../lib/markdown.js';

test('renders basic markdown to HTML', async () => {
  const out = await renderMarkdown('# Hi\n\nHello **world**.');
  assert.match(out, /<h1[^>]*>Hi<\/h1>/);
  assert.match(out, /<strong>world<\/strong>/);
});

test('GFM footnotes become Tufte sidenote markup', async () => {
  const out = await renderMarkdown('Text.[^a]\n\n[^a]: A note.');
  assert.match(out, /class="margin-toggle/);
  assert.match(out, /class="sidenote"/);
  assert.doesNotMatch(out, /data-footnotes/);
});

test('code fences get shiki dual-theme CSS variables', async () => {
  const out = await renderMarkdown('```js\nconst x = 1;\n```');
  assert.match(out, /--shiki-dark/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/markdown.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// lib/markdown.js
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeShiki from '@shikijs/rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSidenotes from '../src/plugins/rehype-sidenotes.js';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSidenotes)
  .use(rehypeShiki, {
    themes: { light: 'rose-pine-dawn', dark: 'rose-pine-moon' },
    defaultColor: false,
    wrap: true,
  })
  .use(rehypeStringify);

export async function renderMarkdown(md) {
  return String(await processor.process(md));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/markdown.test.mjs`
Expected: PASS (3 tests). If sidenotes ordering needs the plugin before/after raw, keep `rehypeSidenotes` immediately after `rehypeRaw` as shown.

- [ ] **Step 5: Commit**

```bash
git add lib/markdown.js test/markdown.test.mjs
git commit -m "feat: markdown pipeline with sidenotes and shiki"
```

---

### Task 5: `lib/posts.js` — load and render blog posts

**Files:**
- Create: `lib/posts.js`
- Test: `test/posts.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/posts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPosts } from '../lib/posts.js';

test('loads posts sorted newest-first with rendered html', async () => {
  const posts = await loadPosts();
  assert.ok(posts.length >= 2);
  for (let i = 1; i < posts.length; i++) {
    assert.ok(posts[i - 1].data.date >= posts[i].data.date);
  }
  const p = posts[0];
  assert.equal(typeof p.slug, 'string');
  assert.equal(typeof p.data.title, 'string');
  assert.ok(p.data.date instanceof Date);
  assert.match(p.html, /<p>/);
  assert.ok(p.readingMinutes >= 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/posts.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// lib/posts.js
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { renderMarkdown } from './markdown.js';

const BLOG_DIR = path.resolve('src/content/blog');

export async function loadPosts() {
  const files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith('.md'));
  const posts = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(BLOG_DIR, file), 'utf8');
      const { data, content } = matter(raw);
      const words = content.trim().split(/\s+/).filter(Boolean).length;
      return {
        slug: file.replace(/\.md$/, ''),
        data: { ...data, date: new Date(data.date) },
        html: await renderMarkdown(content),
        readingMinutes: Math.max(1, Math.round(words / 200)),
      };
    }),
  );
  return posts.sort((a, b) => b.data.date - a.data.date);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/posts.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/posts.js test/posts.test.mjs
git commit -m "feat: load and render blog posts"
```

---

### Task 6: `lib/images.js` — build-time image optimizer

**Files:**
- Create: `lib/images.js`
- Test: `test/images.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/images.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { optimizeImage } from '../lib/images.js';

test('emits a hashed webp and returns a manifest entry', async () => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'img-'));
  const entry = await optimizeImage('src/assets/portrait.png', { widths: [120], dist });
  assert.match(entry.src, /^\/_assets\/portrait\.[a-f0-9]{8}\.webp$/);
  assert.ok(entry.width > 0 && entry.height > 0);
  const onDisk = path.join(dist, entry.src.replace(/^\//, ''));
  await assert.doesNotReject(fs.access(onDisk));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/images.test.mjs`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement**

```js
// lib/images.js
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Resize `srcPath` to each requested width as webp, write hashed files under
// dist/_assets/, and return a manifest entry: { src, srcset, width, height }.
export async function optimizeImage(srcPath, { widths = [720], dist = 'dist' } = {}) {
  const buf = await fs.readFile(srcPath);
  const meta = await sharp(buf).metadata();
  const base = path.basename(srcPath).replace(/\.[^.]+$/, '');
  const outDir = path.join(dist, '_assets');
  await fs.mkdir(outDir, { recursive: true });

  const sorted = [...widths].sort((a, b) => a - b);
  const entries = await Promise.all(
    sorted.map(async (w) => {
      const out = await sharp(buf).resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
      const hash = crypto.createHash('sha1').update(out).digest('hex').slice(0, 8);
      const name = `${base}.${hash}.webp`;
      await fs.writeFile(path.join(outDir, name), out);
      return { url: `/_assets/${name}`, w };
    }),
  );

  const largest = entries[entries.length - 1];
  const scale = Math.min(1, sorted[sorted.length - 1] / meta.width);
  return {
    src: largest.url,
    srcset: entries.map((e) => `${e.url} ${e.w}w`).join(', '),
    width: Math.round(meta.width * scale),
    height: Math.round(meta.height * scale),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/images.test.mjs`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add lib/images.js test/images.test.mjs
git commit -m "feat: build-time image optimizer with sharp"
```

---

### Task 7: Components

**Files:**
- Create: `components/Logo.js`, `components/ThemeToggle.js`, `components/Nav.js`, `components/Footer.js`, `components/Photo.js`, `components/PostCard.js`

These are pure functions returning HTML strings; they are verified by the build smoke-test in Task 12 and screenshots in Task 14. No separate unit tests.

- [ ] **Step 1: `components/Logo.js`**

```js
// components/Logo.js
import { html } from '../lib/html.js';

export const Logo = ({ size = 30 } = {}) => html`
  <svg width="${size}" height="${size}" viewBox="0 0 64 64" class="logo-mark" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="58" height="58" rx="18" fill="var(--accent)" />
    <g fill="none" stroke="var(--bg)" stroke-width="5" stroke-linecap="round">
      <path d="M21 19 V45" /><path d="M43 19 V45" />
      <path d="M21 22 L43 34" /><path d="M43 22 L21 34" />
    </g>
  </svg>`;
```

- [ ] **Step 2: `components/ThemeToggle.js`**

```js
// components/ThemeToggle.js
import { html } from '../lib/html.js';

export const ThemeToggle = () => html`
  <button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme">
    <svg class="toggle-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      <mask id="moon-mask">
        <rect x="0" y="0" width="24" height="24" fill="white" />
        <circle class="moon-dot" cx="24" cy="10" r="6" fill="black" />
      </mask>
      <circle class="sun" cx="12" cy="12" r="6" fill="currentColor" mask="url(#moon-mask)" />
      <g class="rays" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
        <line x1="12" y1="1.5" x2="12" y2="3.5" /><line x1="12" y1="20.5" x2="12" y2="22.5" />
        <line x1="1.5" y1="12" x2="3.5" y2="12" /><line x1="20.5" y1="12" x2="22.5" y2="12" />
        <line x1="4.2" y1="4.2" x2="5.6" y2="5.6" /><line x1="18.4" y1="18.4" x2="19.8" y2="19.8" />
        <line x1="4.2" y1="19.8" x2="5.6" y2="18.4" /><line x1="18.4" y1="5.6" x2="19.8" y2="4.2" />
      </g>
    </svg>
  </button>`;
```

- [ ] **Step 3: `components/Nav.js`**

```js
// components/Nav.js
import { html } from '../lib/html.js';
import { Logo } from './Logo.js';
import { ThemeToggle } from './ThemeToggle.js';

export const Nav = () => html`
  <header class="site-header">
    <a class="brand" href="/">${Logo({ size: 44 })}<span>martilama</span></a>
    <nav>
      <a href="/blog">blog</a>
      <a href="/work">work</a>
      <a href="/about">about</a>
      <a href="https://github.com/SierraM-0" target="_blank" rel="noopener noreferrer">github</a>
      ${ThemeToggle()}
    </nav>
  </header>`;
```

- [ ] **Step 4: `components/Footer.js`**

```js
// components/Footer.js
import { html } from '../lib/html.js';

export const Footer = () => {
  const year = new Date().getFullYear();
  return html`
    <footer class="site-footer">
      <p class="footer-currently">
        Currently · reading <em>whatever's half-finished on the bedside table</em> · playing <em>Factorio</em>
      </p>
      <div class="footer-meta">
        <span>© ${year} martilama · Forever building.</span>
        <span><a href="https://github.com/SierraM-0" target="_blank" rel="noopener noreferrer">github</a></span>
      </div>
    </footer>`;
};
```

- [ ] **Step 5: `components/Photo.js`**

`img` is a manifest entry from `optimizeImage` (`{ src, srcset, width, height }`).

```js
// components/Photo.js
import { html } from '../lib/html.js';

export const Photo = ({ img, alt, caption, wide = false, eager = false }) => html`
  <figure class="photo${wide ? ' photo--wide' : ''}">
    <img src="${img.src}" srcset="${img.srcset}" width="${img.width}" height="${img.height}"
         alt="${alt}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" />
    ${caption ? html`<figcaption>${caption}</figcaption>` : ''}
  </figure>`;
```

- [ ] **Step 6: `components/PostCard.js`**

```js
// components/PostCard.js
import { html } from '../lib/html.js';
import { formatDate } from '../lib/format.js';

export const PostCard = ({ post }) => html`
  <article class="post-card">
    <time datetime="${post.data.date.toISOString()}">${formatDate(post.data.date)}</time>
    <h3><a href="/blog/${post.slug}/">${post.data.title}</a></h3>
    <p>${post.data.description}</p>
  </article>`;
```

- [ ] **Step 7: `lib/format.js` (date helper shared by cards/layouts)**

```js
// lib/format.js
export function formatDate(date) {
  return date.toLocaleDateString('en-GB', {
    year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC',
  });
}
export function formatDateLong(date) {
  return date.toLocaleDateString('en-GB', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add components lib/format.js
git commit -m "feat: port components to tagged-template functions"
```

---

### Task 8: Layouts

**Files:**
- Create: `layouts/BaseLayout.js`, `layouts/PostLayout.js`

- [ ] **Step 1: `layouts/BaseLayout.js`**

`opts`: `{ title, description, ogType, ogImage, url, body }`. `body` is a raw HTML string (already built by the page). `url` is the absolute page URL string.

```js
// layouts/BaseLayout.js
import { html, raw } from '../lib/html.js';
import { Nav } from '../components/Nav.js';
import { Footer } from '../components/Footer.js';

const SITE = 'https://martilama.com';
const siteTitle = 'martilama';

export function BaseLayout({ title, description, ogType = 'website', ogImage, url, body }) {
  const fullTitle = title ? `${title} · ${siteTitle}` : `${siteTitle} — personal site`;
  const desc = description ?? 'Writing about life and my small opinions.';
  const ogImageUrl = new URL(ogImage ?? '/og-default.png', SITE).toString();
  return html`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>${fullTitle}</title>
    <meta name="description" content="${desc}" />
    <meta property="og:title" content="${fullTitle}" />
    <meta property="og:description" content="${desc}" />
    <meta property="og:type" content="${ogType}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${ogImageUrl}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:image" content="${ogImageUrl}" />
    <link rel="alternate" type="application/rss+xml" title="${siteTitle}" href="/rss.xml" />
    <link rel="stylesheet" href="/global.css" />
    <script>
      (function () {
        const t = localStorage.getItem('theme')
          ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        document.documentElement.dataset.theme = t;
      })();
    </script>
  </head>
  <body>
    <div class="reading-progress" id="reading-progress" aria-hidden="true"></div>
    <div class="container">
      ${raw(Nav())}
      <main>${raw(body)}</main>
      ${raw(Footer())}
    </div>
    <script src="/js/theme.js"></script>
    <script src="/js/progress.js"></script>
    <script src="/js/clock.js"></script>
  </body>
</html>`;
}
```

- [ ] **Step 2: `layouts/PostLayout.js`**

```js
// layouts/PostLayout.js
import { html, raw } from '../lib/html.js';
import { BaseLayout } from './BaseLayout.js';
import { formatDate } from '../lib/format.js';

export function PostLayout({ post, url }) {
  const body = html`
    <article class="post reveal">
      <h1>${post.data.title}</h1>
      <p class="standfirst">${post.data.description}</p>
      <p class="post-meta">
        <time class="post-date" datetime="${post.data.date.toISOString()}">${formatDate(post.data.date)}</time>
        <span aria-hidden="true">·</span> ${post.readingMinutes} min read
      </p>
      <div class="post-body">${raw(post.html)}</div>
      <p class="post-end" aria-hidden="true">· · ·</p>
    </article>
    <p class="post-back"><a href="/blog">← all posts</a></p>`;
  return BaseLayout({
    title: post.data.title,
    description: post.data.description,
    ogType: 'article',
    ogImage: `/og/${post.slug}.png`,
    url,
    body,
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add layouts
git commit -m "feat: port BaseLayout and PostLayout"
```

---

### Task 9: Pages

**Files:**
- Create: `pages/home.js`, `pages/about.js`, `pages/work.js`, `pages/blogIndex.js`, `pages/post.js`, `pages/notFound.js`

Each page exports a function returning the full HTML document. `ctx` carries `{ posts, img, url }` as needed.

- [ ] **Step 1: `pages/home.js`**

```js
// pages/home.js
import { html, raw } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
import { PostCard } from '../components/PostCard.js';

export function home({ posts, img, url }) {
  const recent = posts.slice(0, 5);
  const p = img['src/assets/portrait.png'];
  const body = html`
    <section class="intro reveal">
      <img class="portrait" src="${p.src}" srcset="${p.srcset}" width="120" height="120"
           alt="A photo of marti" loading="eager" fetchpriority="high" decoding="async" />
      <div>
        <h1>Hello 👋🏻</h1>
        <p>I'm Marti — a product specialist based in Tallinn. This is where I write
           about life in general and whatever small opinions I happen to be holding.</p>
      </div>
    </section>
    <p class="hero-meta reveal reveal-2">Tallinn, Estonia · <time id="localtime">—</time> local</p>
    <div class="section-head reveal reveal-3">
      <h2 class="section-kicker">Recent posts</h2>
      <a class="section-more" href="/blog">all posts →</a>
    </div>
    ${recent.map((post) => raw(PostCard({ post })))}`;
  return BaseLayout({ url, body });
}
```

- [ ] **Step 2: `pages/about.js`**

```js
// pages/about.js
import { html, raw } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
import { Photo } from '../components/Photo.js';

export function about({ img, url }) {
  const body = html`
    <h1 class="reveal">About</h1>
    <p class="standfirst reveal reveal-2">
      A product specialist in Tallinn — and the longer version of who's writing here.
    </p>
    <div class="prose reveal reveal-3">
      ${raw(Photo({ img: img['src/assets/portrait.png'], alt: 'A photo of marti', caption: 'Somewhere in Tallinn.', eager: true }))}
      <p>
        I'm Marti, a product specialist living in Tallinn, Estonia. I spend my days
        thinking about how products actually serve the people using them — and my
        evenings tinkering with a hand-tuned Linux desktop, reading whatever's
        half-finished on the bedside table, and playing slow, atmospheric games.
      </p>
      <p>
        This site is where I keep my writing and a little about the work I do. No
        fixed theme — just life and the small opinions I pick up along the way.
      </p>
    </div>`;
  return BaseLayout({ title: 'About', description: 'A little about marti.', url, body });
}
```

- [ ] **Step 3: `pages/work.js`**

```js
// pages/work.js
import { html } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';

export function work({ url }) {
  const body = html`
    <h1 class="reveal">Work</h1>
    <p class="standfirst reveal reveal-2">
      What I do as a product specialist — the short, honest version.
    </p>
    <div class="prose reveal reveal-3">
      <p>
        I work as a product specialist: I care about the gap between what a product
        is supposed to do and what it actually does for the person in front of it.
        My background mixes engineering and academic work, and I bring that
        systems-minded, slightly stubborn attention to detail to product problems.
      </p>
      <div class="section-head"><h2 class="section-kicker no-tick">What I focus on</h2></div>
      <ul>
        <li>Understanding real user needs over assumed ones.</li>
        <li>Turning messy problems into clear, decidable trade-offs.</li>
        <li>Keeping the people using a product at the centre of the work.</li>
      </ul>
      <div class="section-head"><h2 class="section-kicker no-tick">Elsewhere</h2></div>
      <p>
        For roles, dates, and the formal version, see my
        <a href="https://www.linkedin.com/" target="_blank" rel="noopener noreferrer">LinkedIn</a>.
      </p>
    </div>`;
  return BaseLayout({ title: 'Work', description: 'What I do as a product specialist.', url, body });
}
```

- [ ] **Step 4: `pages/blogIndex.js`**

```js
// pages/blogIndex.js
import { html, raw } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
import { formatDate } from '../lib/format.js';

export function blogIndex({ posts, url }) {
  const rows = posts.map((post, i) => html`
    <li class="contents-row">
      <div class="contents-line">
        <span class="contents-num">${String(i + 1).padStart(2, '0')}</span>
        <a class="contents-title" href="/blog/${post.slug}/">${post.data.title}</a>
        <span class="contents-leader" aria-hidden="true"></span>
        <time class="contents-date" datetime="${post.data.date.toISOString()}">${formatDate(post.data.date)}</time>
      </div>
      <p class="contents-desc">${post.data.description}</p>
    </li>`);
  const body = html`
    <h1>Blog</h1>
    <p class="standfirst">Posts about life and my small opinions.</p>
    <ol class="contents">${rows.map(raw)}</ol>`;
  return BaseLayout({ title: 'Blog', description: 'Posts about life and my small opinions.', url, body });
}
```

- [ ] **Step 5: `pages/post.js` and `pages/notFound.js`**

```js
// pages/post.js
import { PostLayout } from '../layouts/PostLayout.js';
export const post = ({ post, url }) => PostLayout({ post, url });
```

```js
// pages/notFound.js
import { html } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
export function notFound({ url } = {}) {
  const body = html`
    <h1>404</h1>
    <p>That page isn't here. Try the <a href="/">home page</a> or the <a href="/blog">blog</a>.</p>`;
  return BaseLayout({ title: 'Not found', url, body });
}
```

- [ ] **Step 6: Commit**

```bash
git add pages
git commit -m "feat: port pages to render functions"
```

---

### Task 10: `lib/rss.js` and `lib/sitemap.js`

**Files:**
- Create: `lib/rss.js`, `lib/sitemap.js`
- Test: `test/rss.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
// test/rss.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRss } from '../lib/rss.js';
import { buildSitemap } from '../lib/sitemap.js';

const posts = [{
  slug: 'hello', data: { title: 'Hello', description: 'Hi', date: new Date('2026-01-02') }, html: '<p>x</p>',
}];

test('rss contains channel + item with absolute link', () => {
  const xml = buildRss(posts, 'https://martilama.com');
  assert.match(xml, /<title>martilama<\/title>/);
  assert.match(xml, /<link>https:\/\/martilama\.com\/blog\/hello\/<\/link>/);
  assert.match(xml, /<!\[CDATA\[<p>x<\/p>\]\]>/);
});

test('sitemap lists provided routes as absolute urls', () => {
  const xml = buildSitemap(['/', '/blog/hello/'], 'https://martilama.com');
  assert.match(xml, /<loc>https:\/\/martilama\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/martilama\.com\/blog\/hello\/<\/loc>/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/rss.test.mjs`
Expected: FAIL — cannot find modules.

- [ ] **Step 3: Implement `lib/rss.js`**

```js
// lib/rss.js
import sanitizeHtml from 'sanitize-html';
import { escape } from './html.js';

const clean = (html, site) =>
  sanitizeHtml(html.replace(/(href|src)="\//g, `$1="${site}/`), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
  });

export function buildRss(posts, site) {
  const items = posts.map((p) => `    <item>
      <title>${escape(p.data.title)}</title>
      <description>${escape(p.data.description)}</description>
      <pubDate>${p.data.date.toUTCString()}</pubDate>
      <link>${site}/blog/${p.slug}/</link>
      <guid>${site}/blog/${p.slug}/</guid>
      <content:encoded><![CDATA[${clean(p.html, site)}]]></content:encoded>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>martilama</title>
    <description>Writing about life and my small opinions.</description>
    <link>${site}/</link>
${items}
  </channel>
</rss>`;
}
```

- [ ] **Step 4: Implement `lib/sitemap.js`**

```js
// lib/sitemap.js
export function buildSitemap(routes, site) {
  const urls = routes.map((r) => `  <url><loc>${site}${r}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/rss.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/rss.js lib/sitemap.js test/rss.test.mjs
git commit -m "feat: hand-built rss and sitemap builders"
```

---

### Task 11: OG card port + fonts + client JS + View Transitions CSS

**Files:**
- Create: `og/card.js`
- Create: `public/fonts/*.woff2`, `public/favicon.svg`, `public/robots.txt`
- Create: `public/js/theme.js`, `public/js/progress.js`, `public/js/clock.js`
- Modify: `src/styles/global.css` (append `@font-face` + `@view-transition`)

- [ ] **Step 1: Port `og/card.js`**

Copy `src/og/card.ts` to `og/card.js` verbatim, removing the TypeScript type annotations only: drop `: string`, `: Buffer`, `: Promise<Buffer>`, and the `interface CardOptions { … }` block; change the signature to `export async function renderCard({ title, subtitle, date })`. The font `fs.readFileSync('src/og/fonts/...')` paths stay (still valid).

- [ ] **Step 2: Self-host fonts**

Run (copies the latin variable axes that match the current `@fontsource` imports — verify names with `ls node_modules/@fontsource-variable/<f>/files/ | grep latin`):

```bash
cp node_modules/@fontsource-variable/fraunces/files/fraunces-latin-opsz-normal.woff2 public/fonts/
cp node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-normal.woff2 public/fonts/
cp node_modules/@fontsource-variable/newsreader/files/newsreader-latin-opsz-italic.woff2 public/fonts/
cp node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2 public/fonts/
cp public/favicon.svg public/favicon.svg 2>/dev/null; cp $(git rev-parse --show-toplevel)/public/favicon.svg public/ 2>/dev/null || true
```

Then copy the existing static assets from the Astro `public/` dir if present:

```bash
cp -n public/favicon.svg public/ 2>/dev/null || true   # no-op if already here
ls public/   # confirm favicon.svg, robots.txt exist; create robots.txt if missing
```

If `public/favicon.svg`/`robots.txt` do not already exist at repo root, copy them from the Astro project's `public/` directory (same repo). Create `public/robots.txt` with:

```
User-agent: *
Allow: /
Sitemap: https://martilama.com/sitemap.xml
```

- [ ] **Step 3: Append `@font-face` + View Transitions to `src/styles/global.css`**

Append at the top of the file is not required; append this block at the end:

```css
/* Self-hosted fonts (replaces @fontsource npm imports) */
@font-face {
  font-family: 'Fraunces Variable'; font-style: normal; font-weight: 100 900;
  font-display: swap; src: url('/fonts/fraunces-latin-opsz-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Newsreader Variable'; font-style: normal; font-weight: 200 800;
  font-display: swap; src: url('/fonts/newsreader-latin-opsz-normal.woff2') format('woff2');
}
@font-face {
  font-family: 'Newsreader Variable'; font-style: italic; font-weight: 200 800;
  font-display: swap; src: url('/fonts/newsreader-latin-opsz-italic.woff2') format('woff2');
}
@font-face {
  font-family: 'JetBrains Mono Variable'; font-style: normal; font-weight: 100 800;
  font-display: swap; src: url('/fonts/jetbrains-mono-latin-wght-normal.woff2') format('woff2');
}

/* Cross-document view transitions (Chromium); degrades to normal loads */
@view-transition { navigation: auto; }
```

Note: the `font-family` names above must match what `global.css` already references (the `@fontsource-variable` CSS uses `'Fraunces Variable'`, `'Newsreader Variable'`, `'JetBrains Mono Variable'`). Verify with `grep -i "font-family" src/styles/global.css` and align names if they differ.

- [ ] **Step 4: Client JS — `public/js/theme.js`**

```js
// public/js/theme.js
document.addEventListener('click', (e) => {
  if (!e.target.closest('#theme-toggle')) return;
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('theme', next);
});
```

- [ ] **Step 5: Client JS — `public/js/progress.js`**

```js
// public/js/progress.js
function updateProgress() {
  const bar = document.getElementById('reading-progress');
  if (!bar) return;
  const article = document.querySelector('.post');
  if (!article) { bar.style.width = '0'; return; }
  const scrollable = article.offsetTop + article.offsetHeight - window.innerHeight;
  const progress = scrollable > 0 ? window.scrollY / scrollable : 0;
  bar.style.width = Math.min(100, Math.max(0, progress * 100)) + '%';
}
window.addEventListener('scroll', updateProgress, { passive: true });
window.addEventListener('resize', updateProgress);
document.addEventListener('DOMContentLoaded', updateProgress);
```

- [ ] **Step 6: Client JS — `public/js/clock.js`**

```js
// public/js/clock.js
const fmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Tallinn' });
let timer;
function tick() {
  const el = document.getElementById('localtime');
  if (!el) return;
  el.textContent = fmt.format(new Date());
  const now = new Date();
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  clearTimeout(timer);
  timer = setTimeout(tick, ms + 50);
}
document.addEventListener('DOMContentLoaded', tick);
```

- [ ] **Step 7: Commit**

```bash
git add og/card.js public src/styles/global.css
git commit -m "feat: og port, self-hosted fonts, client js, view transitions"
```

---

### Task 12: `build.js` orchestration

**Files:**
- Create: `build.js`, `serve.mjs`

- [ ] **Step 1: Implement `build.js`**

```js
// build.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPosts } from './lib/posts.js';
import { optimizeImage } from './lib/images.js';
import { writePage, DIST } from './lib/writePage.js';
import { buildRss } from './lib/rss.js';
import { buildSitemap } from './lib/sitemap.js';
import { renderCard } from './og/card.js';
import { home } from './pages/home.js';
import { about } from './pages/about.js';
import { work } from './pages/work.js';
import { blogIndex } from './pages/blogIndex.js';
import { post as postPage } from './pages/post.js';
import { notFound } from './pages/notFound.js';

const SITE = 'https://martilama.com';
const u = (route) => new URL(route, SITE).toString();

async function copyDir(src, dest) {
  await fs.cp(src, dest, { recursive: true });
}

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  // 1. async prep
  const posts = await loadPosts();
  const img = {
    'src/assets/portrait.png': await optimizeImage('src/assets/portrait.png', { widths: [120, 720], dist: DIST }),
  };

  // 2. static passthrough
  await copyDir('public', DIST);
  await fs.copyFile('src/styles/global.css', path.join(DIST, 'global.css'));

  // 3. render pages (sync) via the single choke point
  await writePage('/', home({ posts, img, url: u('/') }));
  await writePage('/about', about({ img, url: u('/about') }));
  await writePage('/work', work({ url: u('/work') }));
  await writePage('/blog', blogIndex({ posts, url: u('/blog') }));
  for (const p of posts) {
    await writePage(`/blog/${p.slug}`, postPage({ post: p, url: u(`/blog/${p.slug}/`) }));
  }
  await writePage('/404.html', notFound({ url: u('/404') }));

  // 4. endpoints
  for (const p of posts) {
    const date = p.data.date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
    const png = await renderCard({ title: p.data.title, subtitle: p.data.description, date });
    await writePage(`/og/${p.slug}.png`, png);
  }
  await writePage('/og-default.png', await renderCard({ title: 'martilama', subtitle: 'Writing about life and my small opinions.' }));

  const routes = ['/', '/about', '/work', '/blog', ...posts.map((p) => `/blog/${p.slug}/`)];
  await writePage('/rss.xml', buildRss(posts, SITE));
  await writePage('/sitemap.xml', buildSitemap(routes, SITE));

  console.log(`Built ${routes.length} pages + ${posts.length} OG images → dist/`);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Implement `serve.mjs` (preview static server)**

```js
// serve.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('dist');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.woff2': 'font/woff2' };

http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!path.extname(p)) p = path.join(p, 'index.html');
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); fs.readFile(path.join(DIST, '404.html'), (e, b) => res.end(e ? 'Not found' : b)); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' });
    res.end(buf);
  });
}).listen(4321, () => console.log('Preview on http://localhost:4321'));
```

- [ ] **Step 3: Run the build**

Run: `node build.js`
Expected: prints `Built N pages + M OG images → dist/`, exit 0. `dist/index.html`, `dist/blog/index.html`, `dist/blog/<slug>/index.html`, `dist/rss.xml`, `dist/sitemap.xml`, `dist/og/<slug>.png`, `dist/404.html`, `dist/global.css`, `dist/fonts/*.woff2`, `dist/_assets/*.webp` all exist.

- [ ] **Step 4: Run the full test suite**

Run: `node --test`
Expected: all tests PASS (html, writePage, markdown, posts, images, rss, and the existing rehype-sidenotes test).

- [ ] **Step 5: Commit**

```bash
git add build.js serve.mjs
git commit -m "feat: build orchestration and preview server"
```

---

### Task 13: Parity verification against the live site

**Files:** none (verification only)

- [ ] **Step 1: Build both versions side by side**

Run:
```bash
node build.js && cp -r dist /tmp/hand-dist
npx astro build && cp -r dist /tmp/astro-dist
```
Expected: both succeed.

- [ ] **Step 2: Compare generated routes**

Run:
```bash
( cd /tmp/hand-dist && find . -type f | sort ) > /tmp/hand.txt
( cd /tmp/astro-dist && find . -type f | sort ) > /tmp/astro.txt
diff /tmp/astro.txt /tmp/hand.txt || true
```
Expected: the route set matches (home, about, work, blog index, each post, 404, rss.xml, sitemap.xml, og images). Hashed asset filenames (`_assets/*`, Astro's `_astro/*`) and Astro-only build artifacts will differ — that is acceptable. Note any *missing page route* as a gap to fix before proceeding.

- [ ] **Step 3: Screenshot each page from the hand-built output**

Run `node serve.mjs` in the background, then for each of `/`, `/about`, `/work`, `/blog`, `/blog/a-keyboard-headphones-a-book/`:

```bash
firefox --headless --no-remote --profile "$(mktemp -d)" --screenshot /tmp/shot-home.png http://localhost:4321/
```

(Set `user_pref("ui.prefersReducedMotion", 1);` in the temp profile's `user.js` first, matching prior screenshot practice.) Visually confirm: header brand lockup, theme, fonts, portrait, post list, sidenotes on the keyboard post, code-block colors, footer. Compare against the live `https://martilama.com` pages.

- [ ] **Step 4: Verify View Transitions and theme toggle manually**

Confirm in a Chromium browser that navigating between pages cross-fades, and the theme toggle flips + persists across reloads. In Firefox confirm navigation still works (no transition is fine).

- [ ] **Step 5: Fix any parity gaps**

For each visual/route difference found, fix the relevant component/page/CSS and re-run `node build.js`. Re-screenshot until parity holds. Commit fixes:

```bash
git add -A
git commit -m "fix: close parity gaps with Astro output"
```

---

### Task 14: Cutover — adopt root layout, remove Astro, switch build command

**Files:**
- Move: `src/content/blog` → `content/blog`; `src/styles/global.css` → `styles/global.css`; `src/og/fonts` → `og/fonts`; `src/plugins/rehype-sidenotes.js` → `plugins/rehype-sidenotes.js`; `src/assets` → `assets`
- Modify: `build.js`, `lib/posts.js`, `lib/markdown.js`, `og/card.js` (update the moved input paths)
- Delete: `astro.config.mjs`, `src/pages/`, `src/components/*.astro`, `src/layouts/*.astro`, `src/content.config.ts`, `src/utils/`, `src/og/card.ts`
- Modify: `package.json` (remove Astro deps + scripts)

**Do this task only after Task 13 parity is confirmed.**

- [ ] **Step 1: Relocate shared inputs to the root layout**

```bash
git mv src/content/blog content/blog
git mv src/styles/global.css styles/global.css
git mv src/og/fonts og/fonts
git mv src/plugins/rehype-sidenotes.js plugins/rehype-sidenotes.js
git mv src/assets assets
```

- [ ] **Step 2: Update input paths in the generator**

Update these references to drop the `src/` prefix:
- `lib/posts.js`: `BLOG_DIR = path.resolve('content/blog')`
- `lib/markdown.js`: import `'../plugins/rehype-sidenotes.js'`
- `og/card.js`: `fs.readFileSync('og/fonts/Fraunces-Static.ttf')`, `'og/fonts/JetBrainsMono-Medium.ttf'`
- `build.js`: `optimizeImage('assets/portrait.png', …)`, key `'assets/portrait.png'`, and `fs.copyFile('styles/global.css', …)`
- `pages/home.js`, `pages/about.js`: image manifest key `img['assets/portrait.png']`

- [ ] **Step 3: Remove Astro**

```bash
git rm -r src/pages src/components src/layouts src/content.config.ts src/utils src/og/card.ts astro.config.mjs
```

Then edit `package.json`: remove `astro`, `@astrojs/rss`, `@astrojs/sitemap`, `@fontsource-variable/*`; change `scripts` to:

```json
  "scripts": {
    "build": "node build.js",
    "preview": "node serve.mjs",
    "test": "node --test"
  }
```

- [ ] **Step 4: Clean install and full build/test**

Run: `rm -rf node_modules package-lock.json && npm install && node build.js && node --test`
Expected: install succeeds without Astro; build prints success; all tests pass.

- [ ] **Step 5: Re-verify one screenshot post-move**

Run `node serve.mjs` and screenshot `/` to confirm the path moves didn't break image/font/CSS references.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: cut over to hand-built generator, remove Astro"
```

- [ ] **Step 7: Update Cloudflare build command (manual, user action)**

In the Cloudflare dashboard for the `martilama` project, change the build command from `astro build` to `node build.js` (output dir stays `dist`). This is a dashboard action the user performs; flag it explicitly. After merging `handbuilt-rebuild` → `main`, confirm the deploy succeeds and spot-check the live site.

---

## Notes for the implementer

- **Run from the repo root** (`~/Documents/Yggdrasil/Asgard/Bragi/site`) for every command.
- **Commit authorship:** use `git -c user.name="marti" -c user.email="z2bvxdysxt@privaterelay.appleid.com" commit … ` with a trailing `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` line, matching repo convention.
- **All work stays on the `handbuilt-rebuild` branch** until parity is confirmed and the user approves merging to `main`.
- **Inline-markdown image optimization is intentionally deferred.** The spec mentions a rehype step to optimize images referenced *inside* posts, but no current post references an image (and the optional `cover` frontmatter is not rendered by any page today), so building it now would add an unused path. If/when a post embeds an image, add a rehype step in `lib/markdown.js` that calls `optimizeImage` for `<img>` srcs — the optimizer already exists. This is a parity-neutral deferral, not a missing feature.
