export function buildSitemap(routes, site) {
  const urls = routes.map((r) => `  <url><loc>${site}${r}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
