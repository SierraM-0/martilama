# martilama.com Personal Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a warm, minimal, tabi-inspired personal site (home, about, lightweight work page, blog) as a custom Astro project, migrate the two existing posts, and deploy on Cloudflare.

**Architecture:** A static Astro site (no UI framework). Shared layout + small single-purpose components; CSS custom properties drive a light/dark theme with one warm accent. Blog posts are a Markdown content collection (no tags). Images go through `astro:assets`. RSS via `@astrojs/rss`. Deployed via git → Cloudflare, output `dist/`.

**Tech Stack:** Astro 5, Node + npm, `@astrojs/rss`, `@astrojs/sitemap`, `astro:assets`, plain CSS.

**Repo root for all paths below:** `~/Documents/Yggdrasil/Asgard/Bragi/site/`

---

## File Structure

```
site/
├─ package.json            Task 1
├─ astro.config.mjs        Task 1
├─ tsconfig.json           Task 1
├─ .gitignore              Task 1
├─ public/
│  ├─ favicon.svg          Task 1
│  └─ _redirects           Task 10
├─ src/
│  ├─ styles/global.css    Task 2
│  ├─ content.config.ts    Task 4
│  ├─ content/blog/
│  │  ├─ hello-world.md                  Task 4
│  │  └─ a-keyboard-headphones-a-book.md Task 4
│  ├─ assets/portrait.png  Task 5 (placeholder; user swaps real photo)
│  ├─ components/
│  │  ├─ Nav.astro         Task 3
│  │  ├─ Footer.astro      Task 3
│  │  ├─ ThemeToggle.astro Task 3
│  │  ├─ PostCard.astro    Task 6
│  │  └─ Photo.astro       Task 8
│  ├─ layouts/
│  │  ├─ BaseLayout.astro  Task 3
│  │  └─ PostLayout.astro  Task 7
│  └─ pages/
│     ├─ index.astro       Task 5
│     ├─ about.astro       Task 8
│     ├─ work.astro        Task 9
│     ├─ 404.astro         Task 11
│     ├─ rss.xml.js        Task 10
│     └─ blog/
│        ├─ index.astro    Task 6
│        └─ [slug].astro   Task 7
└─ README.md               Task 12
```

**Verification convention:** Astro is a static-site build, so each task is verified by a successful `npm run build` plus a concrete check on the generated `dist/` output (the build is the test). Visual review with `npm run dev` is called out where it matters.

---

### Task 1: Scaffold project, config, and dependencies

**Files:**
- Create: `package.json`, `astro.config.mjs`, `tsconfig.json`, `.gitignore`, `public/favicon.svg`, `src/pages/index.astro` (temporary)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "martilama-site",
  "type": "module",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "check": "astro check"
  },
  "dependencies": {
    "astro": "^5.0.0",
    "@astrojs/rss": "^4.0.0",
    "@astrojs/sitemap": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `astro.config.mjs`**

```js
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://martilama.com',
  integrations: [sitemap()],
});
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "extends": "astro/tsconfigs/strict",
  "include": [".astro/types.d.ts", "**/*"],
  "exclude": ["dist"]
}
```

- [ ] **Step 4: Create `.gitignore`**

```
dist/
node_modules/
.astro/
.DS_Store
*.log
.env
.env.production
```

- [ ] **Step 5: Create `public/favicon.svg`** (a floppy-disk nod to the old `💾` favicon)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💾</text></svg>
```

- [ ] **Step 6: Create a temporary `src/pages/index.astro`** (replaced in Task 5)

```astro
<html><body><h1>martilama.com — building</h1></body></html>
```

- [ ] **Step 7: Install dependencies**

Run: `cd ~/Documents/Yggdrasil/Asgard/Bragi/site && npm install`
Expected: completes, creates `node_modules/` and `package-lock.json`.

- [ ] **Step 8: Verify the build works**

Run: `npm run build`
Expected: "Complete!" with at least 1 page built; `dist/index.html` exists.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json astro.config.mjs tsconfig.json .gitignore public/ src/
git commit -m "Scaffold Astro project with config and dependencies"
```

---

### Task 2: Global styles and theme tokens (light/dark + warm accent)

**Files:**
- Create: `src/styles/global.css`

- [ ] **Step 1: Create `src/styles/global.css`**

```css
:root {
  --maxw: 720px;
  --font-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Inter, sans-serif;
  --font-mono: ui-monospace, "JetBrainsMono Nerd Font", "JetBrains Mono", monospace;

  /* Light theme (warm) */
  --bg: #faf8f5;
  --surface: #f1ece4;
  --text: #2b2722;
  --muted: #6b6358;
  --border: #e7e0d6;
  --accent: #b85c38;       /* warm terracotta */
  --accent-hover: #9c4a2b;
}

:root[data-theme="dark"] {
  --bg: #14110e;
  --surface: #1d1813;
  --text: #e8e2d9;
  --muted: #9a9085;
  --border: #2a241e;
  --accent: #e0915f;
  --accent-hover: #eba874;
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-sans);
  font-size: 1.05rem;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}

.container {
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0 1.25rem;
}

a { color: var(--accent); text-decoration: none; }
a:hover { color: var(--accent-hover); text-decoration: underline; }

h1, h2, h3 { line-height: 1.25; font-weight: 650; }
h1 { font-size: 1.9rem; }
h2 { font-size: 1.4rem; margin-top: 2rem; }

code {
  font-family: var(--font-mono);
  font-size: 0.9em;
  background: var(--surface);
  padding: 0.15em 0.35em;
  border-radius: 4px;
}
pre {
  background: var(--surface);
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
}
pre code { background: none; padding: 0; }

img { max-width: 100%; height: auto; }

hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }

/* Site chrome */
.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.5rem 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 2.5rem;
}
.site-header nav { display: flex; align-items: center; gap: 1.1rem; }
.site-header nav a { color: var(--text); font-size: 0.97rem; }
.site-header nav a:hover { color: var(--accent); text-decoration: none; }
.brand { font-weight: 700; font-size: 1.1rem; color: var(--text) !important; }

.site-footer {
  border-top: 1px solid var(--border);
  margin-top: 4rem;
  padding: 2rem 0;
  color: var(--muted);
  font-size: 0.9rem;
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.site-footer a { color: var(--muted); }

.theme-toggle {
  background: none;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 6px;
  padding: 0.3rem 0.5rem;
  cursor: pointer;
  font-size: 0.95rem;
  line-height: 1;
}
.theme-toggle:hover { border-color: var(--accent); }

/* Home */
.intro { display: flex; gap: 1.5rem; align-items: center; margin-bottom: 2.5rem; }
.portrait { border-radius: 50%; flex-shrink: 0; }

/* Post list */
.post-card { padding: 1.1rem 0; border-bottom: 1px solid var(--border); }
.post-card time { color: var(--muted); font-size: 0.85rem; font-family: var(--font-mono); }
.post-card h3 { margin: 0.2rem 0 0.3rem; font-size: 1.25rem; }
.post-card p { margin: 0; color: var(--muted); }

/* Photos */
.photo { margin: 1.5rem 0; }
.photo img { border-radius: 10px; }
.photo figcaption { color: var(--muted); font-size: 0.85rem; margin-top: 0.4rem; }

@media (max-width: 480px) {
  .intro { flex-direction: column; text-align: center; }
}
```

- [ ] **Step 2: Verify it builds** (it is imported in Task 3; for now just confirm no syntax issue by building)

Run: `npm run build`
Expected: completes with no error.

- [ ] **Step 3: Commit**

```bash
git add src/styles/global.css
git commit -m "Add global styles with light/dark warm theme tokens"
```

---

### Task 3: Base layout, nav, footer, theme toggle

**Files:**
- Create: `src/layouts/BaseLayout.astro`, `src/components/Nav.astro`, `src/components/Footer.astro`, `src/components/ThemeToggle.astro`

- [ ] **Step 1: Create `src/components/ThemeToggle.astro`**

```astro
---
---
<button class="theme-toggle" id="theme-toggle" aria-label="Toggle colour theme">🌗</button>
<script>
  const btn = document.getElementById('theme-toggle');
  btn?.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  });
</script>
```

- [ ] **Step 2: Create `src/components/Nav.astro`**

```astro
---
import ThemeToggle from './ThemeToggle.astro';
---
<header class="site-header">
  <a class="brand" href="/">marti</a>
  <nav>
    <a href="/blog">blog</a>
    <a href="/work">work</a>
    <a href="/about">about</a>
    <a href="https://github.com/SierraM-0" target="_blank" rel="noopener">github</a>
    <ThemeToggle />
  </nav>
</header>
```

- [ ] **Step 3: Create `src/components/Footer.astro`**

```astro
---
const year = new Date().getFullYear();
---
<footer class="site-footer">
  <span>© {year} marti · Forever building.</span>
  <span><a href="https://github.com/SierraM-0" target="_blank" rel="noopener">github</a></span>
</footer>
```

- [ ] **Step 4: Create `src/layouts/BaseLayout.astro`**

```astro
---
import '../styles/global.css';
import Nav from '../components/Nav.astro';
import Footer from '../components/Footer.astro';

const { title, description } = Astro.props;
const siteTitle = "marti";
const fullTitle = title ? `${title} · ${siteTitle}` : `${siteTitle} — personal site`;
const desc = description ?? "Writing about life and my small opinions.";
---
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <title>{fullTitle}</title>
    <meta name="description" content={desc} />
    <meta property="og:title" content={fullTitle} />
    <meta property="og:description" content={desc} />
    <meta property="og:type" content="website" />
    <link rel="alternate" type="application/rss+xml" title={siteTitle} href="/rss.xml" />
    <script is:inline>
      const stored = localStorage.getItem('theme');
      const theme = stored ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      document.documentElement.dataset.theme = theme;
    </script>
  </head>
  <body>
    <div class="container">
      <Nav />
      <main>
        <slot />
      </main>
      <Footer />
    </div>
  </body>
</html>
```

- [ ] **Step 5: Replace `src/pages/index.astro` with a layout smoke test**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Home">
  <h1>Hello 👋🏻</h1>
  <p>Layout smoke test.</p>
</BaseLayout>
```

- [ ] **Step 6: Verify build and inspect output**

Run: `npm run build && grep -c "site-header" dist/index.html`
Expected: build completes; grep prints `1` (nav rendered).

- [ ] **Step 7: Visual check (optional but recommended)**

Run: `npm run dev` and open the printed localhost URL. Confirm nav, footer, and the 🌗 toggle flips light/dark and persists on reload. Stop with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add src/layouts/BaseLayout.astro src/components/ src/pages/index.astro
git commit -m "Add base layout, nav, footer, and theme toggle"
```

---

### Task 4: Content collection + migrate the two existing posts

**Files:**
- Create: `src/content.config.ts`, `src/content/blog/hello-world.md`, `src/content/blog/a-keyboard-headphones-a-book.md`

- [ ] **Step 1: Create `src/content.config.ts`** (Astro 5 content layer, no tags)

```ts
import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      cover: image().optional(),
    }),
});

export const collections = { blog };
```

- [ ] **Step 2: Create `src/content/blog/hello-world.md`** (frontmatter converted to YAML, tags stripped, atom link updated to `/rss.xml`)

```markdown
---
title: "Hello, world"
description: "First post — what this blog is and why it exists."
date: 2026-05-19
---

This is the first post on my new blog.

It's built with [Astro](https://astro.build/), a static site generator, and
deployed on Cloudflare. Every post here is a Markdown file in a git
repository — when I push, the site rebuilds itself.

There's also an [RSS feed](/rss.xml), so you can follow along in a feed
reader like Newsboat without checking back manually.

## What to expect

No fixed theme — this is just a place to write about life in general and
the small opinions I pick up along the way.

More soon.
```

- [ ] **Step 3: Create `src/content/blog/a-keyboard-headphones-a-book.md`** (frontmatter converted to YAML, tags stripped; body unchanged)

```markdown
---
title: "A keyboard, headphones, a book"
description: "The handful of physical objects I actually reach for every day, and how short that list turns out to be once I'm honest about it."
date: 2026-05-20
---

I tried to make a list the other day, of the physical things I actually touch on
a normal day. Not the things I own, not the things I like the idea of owning —
the things my hands genuinely find without me thinking about it. The list got
embarrassingly short.

A keyboard. A pair of headphones. A book.

That's most of it. There's a phone in there too, and a mug, and the
computer the keyboard is connected to. But once you separate "objects I use" from
"objects that are around," the working set is small enough to count on one hand.

## The honest part

I think the honest part is that I expected the list to be longer. I have a
3D printer that hasn't run in more than eight months, a small shelf of board
games, a drawer of cables I keep meaning to sort. None of that made the list.
Wanting to use a thing isn't the same as reaching for it.

The keyboard I reach for because the day is mostly typing. The headphones I
reach for because the day is mostly typing *and* I'd like to choose what's in
the room with me while I do it. The book is the one that surprised me a little —
it's there because at some point in the evening I want the screen to stop being
the answer. It's a Kindle, technically, loaded from a Calibre library I drift
through most evenings to pick what's next. I count it as a book because that's
what the hands and the eyes are doing.

I don't think a short list is a problem. I think it's just what an honest day
looks like when you stop counting the props. Most of the objects we accumulate
aren't tools, they're intentions — a thing we bought because we wanted to be
the kind of person who uses it. That's fine. But the three or four things that
actually do the work of a day are worth knowing by name.

Mine, this week, are a keyboard, headphones, and whatever book is currently
half-finished on the bedside table.
```

- [ ] **Step 4: Verify the collection builds**

Run: `npm run build`
Expected: completes; build log shows the `blog` collection synced with 2 entries (no schema errors).

- [ ] **Step 5: Commit**

```bash
git add src/content.config.ts src/content/
git commit -m "Add blog content collection and migrate two existing posts"
```

---

### Task 5: Home page (portrait + intro + latest posts)

**Files:**
- Create: `src/assets/portrait.png` (placeholder), `src/pages/index.astro` (replace)

- [ ] **Step 1: Add a placeholder portrait** (user swaps a real photo later; build needs a real file now)

Run: `cp ~/.face.icon ~/Documents/Yggdrasil/Asgard/Bragi/site/src/assets/portrait.png`
Expected: file exists at `src/assets/portrait.png`.

- [ ] **Step 2: Replace `src/pages/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import { Image } from 'astro:assets';
import BaseLayout from '../layouts/BaseLayout.astro';
import PostCard from '../components/PostCard.astro';
import portrait from '../assets/portrait.png';

const posts = (await getCollection('blog'))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
  .slice(0, 5);
---
<BaseLayout>
  <section class="intro">
    <Image src={portrait} alt="A photo of marti" width={120} height={120} class="portrait" />
    <div>
      <h1>Hello 👋🏻</h1>
      <p>
        I'm Marti — a product specialist based in Tallinn. This is where I write
        about life in general and whatever small opinions I happen to be holding.
      </p>
    </div>
  </section>

  <h2>Recent posts</h2>
  {posts.map((post) => <PostCard post={post} />)}
</BaseLayout>
```

> Note: `PostCard` is created in Task 6. If executing strictly in order, this page will not build until Task 6 is done — that is expected; run the build check at the end of Task 6.

- [ ] **Step 3: Commit**

```bash
git add src/assets/portrait.png src/pages/index.astro
git commit -m "Add home page with portrait, intro, and latest posts"
```

---

### Task 6: Blog list page + PostCard

**Files:**
- Create: `src/components/PostCard.astro`, `src/pages/blog/index.astro`

- [ ] **Step 1: Create `src/components/PostCard.astro`**

```astro
---
const { post } = Astro.props;
const dateStr = post.data.date.toLocaleDateString('en-GB', {
  year: 'numeric', month: 'short', day: 'numeric',
});
---
<article class="post-card">
  <time datetime={post.data.date.toISOString()}>{dateStr}</time>
  <h3><a href={`/blog/${post.id}/`}>{post.data.title}</a></h3>
  <p>{post.data.description}</p>
</article>
```

- [ ] **Step 2: Create `src/pages/blog/index.astro`**

```astro
---
import { getCollection } from 'astro:content';
import BaseLayout from '../../layouts/BaseLayout.astro';
import PostCard from '../../components/PostCard.astro';

const posts = (await getCollection('blog'))
  .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
---
<BaseLayout title="Blog" description="Posts about life and my small opinions.">
  <h1>Blog</h1>
  <p>Posts about life and my small opinions.</p>
  {posts.map((post) => <PostCard post={post} />)}
</BaseLayout>
```

- [ ] **Step 3: Verify build (home + blog list both render the cards)**

Run: `npm run build && grep -c "post-card" dist/blog/index.html`
Expected: build completes; grep prints `2` (two posts listed).

- [ ] **Step 4: Commit**

```bash
git add src/components/PostCard.astro src/pages/blog/index.astro
git commit -m "Add blog list page and PostCard component"
```

---

### Task 7: Single post page + PostLayout

**Files:**
- Create: `src/layouts/PostLayout.astro`, `src/pages/blog/[slug].astro`

- [ ] **Step 1: Create `src/layouts/PostLayout.astro`**

```astro
---
import BaseLayout from './BaseLayout.astro';
const { post } = Astro.props;
const dateStr = post.data.date.toLocaleDateString('en-GB', {
  year: 'numeric', month: 'short', day: 'numeric',
});
---
<BaseLayout title={post.data.title} description={post.data.description}>
  <article>
    <h1>{post.data.title}</h1>
    <p><time datetime={post.data.date.toISOString()} style="color:var(--muted);font-family:var(--font-mono);font-size:0.85rem;">{dateStr}</time></p>
    <slot />
  </article>
  <p style="margin-top:2.5rem;"><a href="/blog">← all posts</a></p>
</BaseLayout>
```

- [ ] **Step 2: Create `src/pages/blog/[slug].astro`**

```astro
---
import { getCollection, render } from 'astro:content';
import PostLayout from '../../layouts/PostLayout.astro';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

const { post } = Astro.props;
const { Content } = await render(post);
---
<PostLayout post={post}>
  <Content />
</PostLayout>
```

- [ ] **Step 3: Verify post pages build**

Run: `npm run build && test -f dist/blog/hello-world/index.html && grep -q "first post" dist/blog/hello-world/index.html && echo OK`
Expected: prints `OK` (post page generated with body content).

- [ ] **Step 4: Commit**

```bash
git add src/layouts/PostLayout.astro src/pages/blog/[slug].astro
git commit -m "Add single post page and post layout"
```

---

### Task 8: About page + Photo component

**Files:**
- Create: `src/components/Photo.astro`, `src/pages/about.astro`

- [ ] **Step 1: Create `src/components/Photo.astro`**

```astro
---
import { Image } from 'astro:assets';
const { src, alt, caption } = Astro.props;
---
<figure class="photo">
  <Image src={src} alt={alt} />
  {caption && <figcaption>{caption}</figcaption>}
</figure>
```

- [ ] **Step 2: Create `src/pages/about.astro`** (reuses the placeholder portrait; user adds candid photos to `src/assets/` and imports them later)

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Photo from '../components/Photo.astro';
import portrait from '../assets/portrait.png';
---
<BaseLayout title="About" description="A little about marti.">
  <h1>About</h1>

  <Photo src={portrait} alt="A photo of marti" caption="Somewhere in Tallinn." />

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
</BaseLayout>
```

> Note: the prose above is placeholder copy in marti's voice — replace with the real bio. The structure (intro photo + two short paragraphs) is what matters.

- [ ] **Step 3: Verify build**

Run: `npm run build && grep -q "About" dist/about/index.html && echo OK`
Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/components/Photo.astro src/pages/about.astro
git commit -m "Add about page and Photo component"
```

---

### Task 9: Work page (lightweight career)

**Files:**
- Create: `src/pages/work.astro`

- [ ] **Step 1: Create `src/pages/work.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Work" description="What I do as a product specialist.">
  <h1>Work</h1>

  <p>
    I work as a product specialist: I care about the gap between what a product
    is supposed to do and what it actually does for the person in front of it.
    My background mixes engineering and academic work, and I bring that
    systems-minded, slightly stubborn attention to detail to product problems.
  </p>

  <h2>What I focus on</h2>
  <ul>
    <li>Understanding real user needs over assumed ones.</li>
    <li>Turning messy problems into clear, decidable trade-offs.</li>
    <li>Keeping the people using a product at the centre of the work.</li>
  </ul>

  <h2>Elsewhere</h2>
  <p>
    For roles, dates, and the formal version, see my
    <a href="https://www.linkedin.com/" target="_blank" rel="noopener">LinkedIn</a>.
  </p>
</BaseLayout>
```

> Note: placeholder copy + a placeholder LinkedIn URL — replace the bullets and the link with real details. Structure (intro → focus areas → link out) is the deliverable.

- [ ] **Step 2: Verify build**

Run: `npm run build && grep -q "product specialist" dist/work/index.html && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/work.astro
git commit -m "Add lightweight work page"
```

---

### Task 10: RSS feed + redirects

**Files:**
- Create: `src/pages/rss.xml.js`, `public/_redirects`

- [ ] **Step 1: Create `src/pages/rss.xml.js`**

```js
import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = (await getCollection('blog'))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());

  return rss({
    title: "marti's blog",
    description: 'Writing about life and my small opinions.',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.date,
      link: `/blog/${post.id}/`,
    })),
  });
}
```

- [ ] **Step 2: Create `public/_redirects`** (Cloudflare honours this; keeps old Atom subscribers working)

```
/atom.xml  /rss.xml  301
```

- [ ] **Step 3: Verify the feed builds and contains both posts**

Run: `npm run build && grep -c "<item>" dist/rss.xml`
Expected: build completes; grep prints `2`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/rss.xml.js public/_redirects
git commit -m "Add RSS feed and atom.xml redirect"
```

---

### Task 11: 404 page

**Files:**
- Create: `src/pages/404.astro`

- [ ] **Step 1: Create `src/pages/404.astro`**

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
---
<BaseLayout title="Not found">
  <h1>404</h1>
  <p>That page isn't here. Try the <a href="/">home page</a> or the <a href="/blog">blog</a>.</p>
</BaseLayout>
```

- [ ] **Step 2: Verify build**

Run: `npm run build && test -f dist/404.html && echo OK`
Expected: prints `OK`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/404.astro
git commit -m "Add 404 page"
```

---

### Task 12: README + deploy notes

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
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
```

- [ ] **Step 2: Final full build check**

Run: `npm run build`
Expected: completes; `dist/` contains `index.html`, `about/`, `work/`, `blog/index.html`, `blog/hello-world/`, `blog/a-keyboard-headphones-a-book/`, `rss.xml`, `404.html`, `sitemap-index.xml`.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "Add README and deploy notes"
```

---

## Post-implementation (manual, by marti — outside this plan)

These need real accounts/assets and are not code tasks:

1. Swap `src/assets/portrait.png` for a real photo; add candid photos to About; replace placeholder bio/work copy and the LinkedIn URL.
2. Push the repo to GitHub as `SierraM-0/site`.
3. Create the Cloudflare Pages/Workers project (build `npm run build`, output `dist`).
4. Point `martilama.com` at the new project; add the `blog.martilama.com → /blog` 301 redirect rule.
5. Archive the old Zola `blog` repo.

---

## Self-Review

**Spec coverage:**
- Astro static, no UI framework, Node/npm → Task 1. ✓
- Integrations (rss, sitemap), `astro:assets` → Task 1 (config/sitemap), Task 10 (rss), Tasks 5/8 (assets). ✓
- Plain CSS + custom properties, light/dark + warm accent, JS toggle → Tasks 2, 3. ✓
- IA routes `/`, `/about`, `/work`, `/blog`, `/blog/<slug>`, `/rss.xml`, `404` → Tasks 5, 8, 9, 6, 7, 10, 11. ✓
- No tags anywhere → schema (Task 4), nav (Task 3), cards (Task 6) all tag-free. ✓
- Components (BaseLayout, PostLayout, PostCard, Nav, Footer, ThemeToggle, Photo, Prose) → Tasks 3, 6, 7, 8. (Prose: typography handled via global `article`/post styles in Task 2 rather than a separate component — intentional simplification; noted here as the one deviation from the spec's component list.)
- Content model (title/description/date/cover, no tags) → Task 4. ✓
- Migrate 2 posts, preserve slugs/dates, strip tags → Task 4. ✓
- RSS + atom.xml redirect, blog subdomain 301 → Task 10 (`/atom.xml`), Task 12 README (subdomain rule is Cloudflare-level, documented). ✓
- Deploy via Cloudflare, `npm run build` → `dist` → Task 12. ✓
- Repo at `Bragi/site`, push as `SierraM-0/site`, old repo archived → Task 12 + post-impl. ✓
- Warm portrait + candid About photos → Tasks 5, 8. ✓
- Out-of-scope items (search, comments, series, i18n, case studies, analytics) → correctly omitted. ✓

**Placeholder scan:** Copy marked "placeholder" (bio, work bullets, LinkedIn URL, portrait image) is intentional content-to-be-filled by the author, called out explicitly with notes — not plan-instruction placeholders. No "TBD/handle edge cases/similar to Task N" instruction gaps.

**Type consistency:** `post.id` used for slugs/links consistently (Tasks 6, 7, 10); `post.data.{title,description,date}` consistent across PostCard, PostLayout, rss; collection name `blog` consistent (Tasks 4, 5, 6, 7, 10).

**One deviation noted:** the spec's `Prose.astro` is folded into global post typography (Task 2) instead of a standalone component, to avoid an empty wrapper. Flagged above; revisit if richer post styling is wanted later.
