import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSidenotes from '../src/plugins/rehype-sidenotes.js';

// Mirrors Astro's pipeline: GFM footnotes -> hast -> our transform -> HTML.
function render(md) {
  return unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSidenotes)
    .use(rehypeStringify)
    .processSync(md)
    .toString();
}

const SAMPLE = 'A claim.[^k]\n\n[^k]: The aside.\n';

test('emits the sidenote triplet for a footnote reference', () => {
  const html = render(SAMPLE);
  assert.match(html, /<input[^>]*type="checkbox"[^>]*id="sn-k"[^>]*>/);
  assert.match(html, /class="margin-toggle sidenote-number"/);
  assert.match(html, /<span class="sidenote">The aside\.<\/span>/);
});

test('removes the bottom footnotes section', () => {
  const html = render(SAMPLE);
  assert.doesNotMatch(html, /data-footnotes/);
  assert.doesNotMatch(html, /<section/);
});

test('drops the back-reference anchor', () => {
  const html = render(SAMPLE);
  assert.doesNotMatch(html, /data-footnote-backref/);
});

test('a post with no footnotes is left untouched', () => {
  const html = render('Just a plain paragraph.\n');
  assert.doesNotMatch(html, /sidenote/);
  assert.doesNotMatch(html, /margin-toggle/);
});
