import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { renderMarkdown } from './markdown.js';

const BLOG_DIR = path.resolve('src/content/blog');

export async function loadPosts() {
  const files = (await fs.readdir(BLOG_DIR)).filter((f) => f.endsWith('.md'));
  const posts = await Promise.all(
    files.map(async (file) => {
      const raw = await fs.readFile(path.join(BLOG_DIR, file), 'utf8');
      const { data, content } = matter(raw);
      const words = content.trim().split(/\s+/).filter(Boolean).length;
      return {
        slug: file.replace(/\.md$/, ''),
        data: { ...data, date: new Date(data.date) },
        html: await renderMarkdown(content),
        readingMinutes: Math.max(1, Math.round(words / 200)),
      };
    }),
  );
  return posts.sort((a, b) => b.data.date - a.data.date);
}
