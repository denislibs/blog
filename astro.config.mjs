import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { rehypeFigure } from './src/lib/rehype-figure.mjs';

export default defineConfig({
  // Замени на свой домен перед деплоем
  site: 'https://example.com',
  // Страницы собираются в статику, сервер нужен только для /api/likes
  adapter: node({ mode: 'standalone' }),
  markdown: {
    shikiConfig: { theme: 'github-light' },
    rehypePlugins: [rehypeFigure],
  },
});
