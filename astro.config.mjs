import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import rehypeSidenotes from './src/plugins/rehype-sidenotes.js';

export default defineConfig({
  site: 'https://martilama.com',
  integrations: [sitemap()],
  markdown: {
    rehypePlugins: [rehypeSidenotes],
    shikiConfig: {
      // Warm dual themes; defaultColor:false emits CSS vars we switch by data-theme.
      themes: { light: 'rose-pine-dawn', dark: 'rose-pine-moon' },
      defaultColor: false,
      wrap: true,
    },
  },
});
