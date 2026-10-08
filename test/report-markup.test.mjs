import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Footer } from '../components/Footer.js';
import { BaseLayout } from '../layouts/BaseLayout.js';

test('footer carries a hidden report link and a blocked dialog', () => {
  const out = Footer();
  assert.match(out, /<span id="report-slot" hidden>/);
  assert.match(out, /<button type="button" class="report-link" id="report-link">report a problem<\/button>/);
  assert.match(out, /<dialog id="report-dialog" class="report-dialog rr-block"/);
  assert.match(out, /<textarea id="report-note"[^>]*maxlength="1000"/);
  assert.ok(out.includes(
    'This sends a replay of about your last 3 minutes on this site, and the browser console log, to Marti.',
  ));
  for (const id of ['report-form', 'report-status', 'report-cancel', 'report-send']) {
    assert.ok(out.includes(`id="${id}"`), id);
  }
});

test('recorder scripts load before every other script, in order', () => {
  const out = BaseLayout({ title: 't', url: 'https://martilama.com/', body: '' });
  const order = [
    '/js/vendor/rrweb-record.min.js',
    '/js/vendor/rrweb-console-record.min.js',
    '/js/report-buffer.js',
    '/js/report.js',
    '/js/theme.js',
    '/js/router.js',
  ].map((src) => out.indexOf(`<script src="${src}`));
  assert.ok(order.every((i) => i > 0), `missing script: ${order}`);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
