import { html } from '../lib/html.js';
import { BaseLayout } from '../layouts/BaseLayout.js';
export function notFound({ url } = {}) {
  const body = html`
    <h1>404</h1>
    <p>That page isn't here. Try the <a href="/">home page</a> or the <a href="/blog">blog</a>.</p>`;
  return BaseLayout({ title: 'Not found', url, body });
}
