import fs from 'node:fs/promises';
import path from 'node:path';

export const DIST = path.resolve('dist');

// A path ending in `.<ext>` is written verbatim; otherwise it's a route and
// gets `/index.html` so clean URLs work on static hosting. Slugs must not
// contain dots — a dot signals a literal file path.
export async function writePage(route, contents, dist = DIST) {
  const rel = route.replace(/^\//, '');
  const isFile = /\.[a-z0-9]+$/i.test(rel);
  const target = isFile ? path.join(dist, rel) : path.join(dist, rel, 'index.html');
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents);
  return target;
}
