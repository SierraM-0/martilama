import { test } from 'node:test';
import assert from 'node:assert/strict';
import { html, raw, escape } from '../lib/html.js';

test('escapes interpolated values', () => {
  assert.equal(html`<p>${'<script>'}</p>`, '<p>&lt;script&gt;</p>');
});

test('raw() passes through unescaped', () => {
  assert.equal(html`<div>${raw('<b>hi</b>')}</div>`, '<div><b>hi</b></div>');
});

test('arrays are joined without separator', () => {
  assert.equal(html`${[raw('<a>'), raw('<b>')]}`, '<a><b>');
});

test('nested html() output is not double-escaped', () => {
  const inner = html`<span>${'a&b'}</span>`;
  assert.equal(html`<p>${raw(inner)}</p>`, '<p><span>a&amp;b</span></p>');
});

test('escape() handles all five entities', () => {
  assert.equal(escape(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
});

test('0 renders as "0" (not suppressed)', () => {
  assert.equal(html`<span>${0}</span>`, '<span>0</span>');
});

test('boolean true and false both render empty', () => {
  assert.equal(html`<i>${true}</i><i>${false}</i>`, '<i></i><i></i>');
});

test('arrays escape each plain-string element', () => {
  assert.equal(html`${['<a>', '<b>']}`, '&lt;a&gt;&lt;b&gt;');
});

test('a plain object throws', () => {
  assert.throws(() => html`${{}}`, TypeError);
});
