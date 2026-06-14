import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';

// Resize `srcPath` to each requested width as webp, write hashed files under
// dist/_assets/, and return a manifest entry: { src, srcset, width, height }.
export async function optimizeImage(srcPath, { widths = [720], dist = 'dist' } = {}) {
  const buf = await fs.readFile(srcPath);
  const base = path.basename(srcPath).replace(/\.[^.]+$/, '');
  const outDir = path.join(dist, '_assets');
  await fs.mkdir(outDir, { recursive: true });

  const sorted = [...widths].sort((a, b) => a - b);
  const entries = await Promise.all(
    sorted.map(async (w) => {
      // resolveWithObject gives the ACTUAL output dimensions, which differ from
      // the requested width when `withoutEnlargement` clamps a small source.
      const { data: out, info } = await sharp(buf)
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      const hash = crypto.createHash('sha1').update(out).digest('hex').slice(0, 8);
      const name = `${base}.${hash}.webp`;
      await fs.writeFile(path.join(outDir, name), out);
      return { url: `/_assets/${name}`, width: info.width, height: info.height };
    }),
  );

  const largest = entries[entries.length - 1];
  return {
    src: largest.url,
    srcset: entries.map((e) => `${e.url} ${e.width}w`).join(', '),
    width: largest.width,
    height: largest.height,
  };
}
