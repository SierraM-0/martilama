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
