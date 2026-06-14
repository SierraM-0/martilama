import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../lib/markdown.js';

test('renders basic markdown to HTML', async () => {
  const out = await renderMarkdown('# Hi\n\nHello **world**.');
  assert.match(out, /<h1[^>]*>Hi<\/h1>/);
  assert.match(out, /<strong>world<\/strong>/);
});

test('GFM footnotes become Tufte sidenote markup', async () => {
  const out = await renderMarkdown('Text.[^a]\n\n[^a]: A note.');
  assert.match(out, /class="margin-toggle/);
  assert.match(out, /class="sidenote"/);
  assert.doesNotMatch(out, /data-footnotes/);
});

test('code fences get shiki dual-theme CSS variables', async () => {
  const out = await renderMarkdown('```js\nconst x = 1;\n```');
  assert.match(out, /--shiki-dark/);
});
