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
