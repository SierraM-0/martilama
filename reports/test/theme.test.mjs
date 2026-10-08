import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import '../public/theme.js';

const { pick } = globalThis.ReportTheme;

test('a saved choice wins over the system setting', () => {
  assert.equal(pick('dark', false), 'dark');
  assert.equal(pick('light', true), 'light');
});

test('with nothing saved, the system setting decides', () => {
  assert.equal(pick(null, true), 'dark');
  assert.equal(pick(null, false), 'light');
});

test('a corrupt saved value is ignored', () => {
  assert.equal(pick('purple', true), 'dark');
  assert.equal(pick('', false), 'light');
});

test('the stylesheet takes its dark palette from the chosen theme', async () => {
  const css = await readFile(new URL('../public/viewer.css', import.meta.url), 'utf8');
  assert.match(css, /:root\[data-theme="dark"\] \{[^}]*--bg: #14110e;/);
  // without the script (no data-theme) the system setting still applies
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme\]\) \{[^}]*--bg: #14110e;/);
});
