import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeShiki from '@shikijs/rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeSidenotes from '../src/plugins/rehype-sidenotes.js';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeSidenotes)
  .use(rehypeRaw)
  .use(rehypeShiki, {
    themes: { light: 'rose-pine-dawn', dark: 'rose-pine-moon' },
    defaultColor: false,
    wrap: true,
  })
  .use(rehypeStringify);

export async function renderMarkdown(md) {
  return String(await processor.process(md));
}
