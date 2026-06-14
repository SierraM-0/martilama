import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadPosts } from '../lib/posts.js';

test('loads posts sorted newest-first with rendered html', async () => {
  const posts = await loadPosts();
  assert.ok(posts.length >= 2);
  for (let i = 1; i < posts.length; i++) {
    assert.ok(posts[i - 1].data.date >= posts[i].data.date);
  }
  const p = posts[0];
  assert.equal(typeof p.slug, 'string');
  assert.equal(typeof p.data.title, 'string');
  assert.ok(p.data.date instanceof Date);
  assert.match(p.html, /<p>/);
  assert.ok(p.readingMinutes >= 1);
});
