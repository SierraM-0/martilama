import { html, raw } from '../lib/html.js';
import { Nav } from '../components/Nav.js';
import { Footer } from '../components/Footer.js';

const SITE = 'https://martilama.com';
const siteTitle = 'martilama';

export function BaseLayout({ title, description, ogType = 'website', ogImage, url, body }) {
  const fullTitle = title ? `${title} · ${siteTitle}` : `${siteTitle} — personal site`;
  const desc = description ?? "Marti's personal site — writing, work, and the odd small opinion.";
  const ogImageUrl = new URL(ogImage ?? '/og-default.png', SITE).toString();
  // Cache-busting stamp for unversioned assets (set by build.js); empty outside a build.
  const v = process.env.ASSET_V ? `?v=${process.env.ASSET_V}` : '';
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
    <link rel="stylesheet" href="/global.css${v}" />
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
    <script src="/js/theme.js${v}"></script>
    <script src="/js/progress.js${v}"></script>
    <script src="/js/clock.js${v}"></script>
    <script src="/js/router.js${v}"></script>
  </body>
</html>`;
}
