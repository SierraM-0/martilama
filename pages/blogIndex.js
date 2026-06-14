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
