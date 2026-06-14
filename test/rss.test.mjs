import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRss } from '../lib/rss.js';
import { buildSitemap } from '../lib/sitemap.js';

const posts = [{
  slug: 'hello', data: { title: 'Hello', description: 'Hi', date: new Date('2026-01-02') }, html: '<p>x</p>',
}];

test('rss contains channel + item with absolute link', () => {
  const xml = buildRss(posts, 'https://martilama.com');
  assert.match(xml, /<title>martilama<\/title>/);
  assert.match(xml, /<link>https:\/\/martilama\.com\/blog\/hello\/<\/link>/);
  assert.match(xml, /<!\[CDATA\[<p>x<\/p>\]\]>/);
});

test('sitemap lists provided routes as absolute urls', () => {
  const xml = buildSitemap(['/', '/blog/hello/'], 'https://martilama.com');
  assert.match(xml, /<loc>https:\/\/martilama\.com\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/martilama\.com\/blog\/hello\/<\/loc>/);
});
