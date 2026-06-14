import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { writePage } from '../lib/writePage.js';

test('writes "/" to index.html at dist root', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await writePage('/', '<html>home</html>', dir);
  assert.equal(await fs.readFile(path.join(dir, 'index.html'), 'utf8'), '<html>home</html>');
});

test('maps "/about" to about/index.html', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await writePage('/about', 'x', dir);
  assert.equal(await fs.readFile(path.join(dir, 'about', 'index.html'), 'utf8'), 'x');
});

test('writes exact filenames (ending in extension) verbatim', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  await writePage('/rss.xml', '<rss/>', dir);
  assert.equal(await fs.readFile(path.join(dir, 'rss.xml'), 'utf8'), '<rss/>');
});

test('writes a Buffer to a nested file path intact', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wp-'));
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
  await writePage('/og/default.png', png, dir);
  const written = await fs.readFile(path.join(dir, 'og', 'default.png'));
  assert.ok(written.equals(png));
});
