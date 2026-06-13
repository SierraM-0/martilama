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

function countOccurrences(haystack, needle) {
  let count = 0;
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    count += 1;
    from = i + needle.length;
  }
  return count;
}

test('a reused footnote reference gets unique ids', () => {
  const html = render('See[^a] and again[^a].\n\n[^a]: A note.\n');
  // First reference -> sn-a, second -> sn-a-2.
  assert.ok(html.includes('id="sn-a"'), 'expected id="sn-a"');
  assert.ok(html.includes('id="sn-a-2"'), 'expected id="sn-a-2"');
  // The bare `sn-a"` id must appear exactly once (not duplicated). The second
  // emission is `sn-a-2"`, which does not contain the substring `sn-a"`.
  assert.equal(countOccurrences(html, 'id="sn-a"'), 1, 'sn-a id must be unique');
  // Two sidenote spans, one per reference.
  assert.equal(
    countOccurrences(html, '<span class="sidenote">'),
    2,
    'expected two sidenote spans'
  );
});

test('a multi-paragraph footnote definition is separated by a space', () => {
  const html = render(
    'A claim.[^m]\n\n[^m]: First para.\n\n    Second para.\n'
  );
  assert.match(html, /First para\. Second para\./);
});
