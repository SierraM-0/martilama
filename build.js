import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
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
    'assets/portrait.png': await optimizeImage('assets/portrait.png', { widths: [120, 720], dist: DIST }),
    'assets/about.png': await optimizeImage('assets/about.png', { widths: [720, 1440], dist: DIST }),
  };

  // 2. static passthrough
  await fs.cp('public', DIST, { recursive: true });
  await fs.copyFile('styles/global.css', path.join(DIST, 'global.css'));

  // Asset version stamp — a short content hash of the CSS + JS. BaseLayout
  // appends it to the /global.css and /js/* URLs as ?v=…, so a deploy that
  // changes either one yields a new URL and every browser refetches. Without
  // this, new HTML can pair with a stale, unversioned cached stylesheet.
  const jsNames = ['theme', 'progress', 'clock', 'router'];
  const assetBufs = await Promise.all([
    fs.readFile('styles/global.css'),
    ...jsNames.map((n) => fs.readFile(`public/js/${n}.js`)),
  ]);
  process.env.ASSET_V = crypto.createHash('sha256')
    .update(Buffer.concat(assetBufs)).digest('hex').slice(0, 8);

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
