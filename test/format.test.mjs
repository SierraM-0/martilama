import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDate, formatDateLong } from '../lib/format.js';

// Use a fixed UTC date; formatting must be timezone-stable (UTC) so the
// rendered date never shifts with the build machine's locale/zone.
const d = new Date('2026-05-20T00:00:00Z');

test('formatDate: en-GB short month, UTC', () => {
  assert.equal(formatDate(d), '20 May 2026');
});

test('formatDateLong: en-GB long month, UTC', () => {
  assert.equal(formatDateLong(d), '20 May 2026');
});

test('formatDateLong spells out a multi-syllable month', () => {
  assert.equal(formatDateLong(new Date('2026-09-03T00:00:00Z')), '3 September 2026');
});

test('formatDate abbreviates the same month', () => {
  // en-GB abbreviates September as "Sept" (4 letters) — matches the original site.
  assert.equal(formatDate(new Date('2026-09-03T00:00:00Z')), '3 Sept 2026');
});
