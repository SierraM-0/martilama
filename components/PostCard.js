import { html } from '../lib/html.js';
import { formatDate } from '../lib/format.js';

export const PostCard = ({ post }) => html`
  <article class="post-card">
    <time datetime="${post.data.date.toISOString()}">${formatDate(post.data.date)}</time>
    <h3><a href="/blog/${post.slug}/">${post.data.title}</a></h3>
    <p>${post.data.description}</p>
  </article>`;
