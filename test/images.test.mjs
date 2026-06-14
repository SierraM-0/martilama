import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { optimizeImage } from '../lib/images.js';

test('emits a hashed webp and returns a manifest entry', async () => {
  const dist = await fs.mkdtemp(path.join(os.tmpdir(), 'img-'));
  const entry = await optimizeImage('assets/portrait.png', { widths: [120], dist });
  assert.match(entry.src, /^\/_assets\/portrait\.[a-f0-9]{8}\.webp$/);
  assert.ok(entry.width > 0 && entry.height > 0);
  const onDisk = path.join(dist, entry.src.replace(/^\//, ''));
  await assert.doesNotReject(fs.access(onDisk));
});
