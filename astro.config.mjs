import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import { rehypeFigure } from './src/lib/rehype-figure.mjs';
import { rehypeTerms } from './src/lib/rehype-terms.mjs';

export default defineConfig({
  // Замени на свой домен перед деплоем
  site: 'https://example.com',
  // Страницы собираются в статику, сервер нужен только для /api/likes
  adapter: node({ mode: 'standalone' }),
  markdown: {
    // две темы подсветки: цвета тёмной лежат в CSS-переменных --shiki-dark, их включает global.css
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
    rehypePlugins: [rehypeFigure, rehypeTerms],
  },
});
