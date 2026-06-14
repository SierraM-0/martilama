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

async function main() {
  await fs.rm(DIST, { recursive: true, force: true });
  await fs.mkdir(DIST, { recursive: true });

  // 1. async prep
  const posts = await loadPosts();
  const img = {
    'src/assets/portrait.png': await optimizeImage('src/assets/portrait.png', { widths: [120, 720], dist: DIST }),
  };

  // 2. static passthrough
  await fs.cp('public', DIST, { recursive: true });
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
