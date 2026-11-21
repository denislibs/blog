// Индекс для поиска по Ctrl+K: заголовок, описание, теги и текст каждого поста без разметки.
// Постов немного, поэтому весь индекс помещается в один небольшой JSON и ищется прямо в браузере.
import type { APIRoute } from 'astro';
import { getPosts } from '../lib/posts';

const plain = (md = '') =>
  md
    .replace(/```[\s\S]*?```/g, ' ') // блоки кода
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // картинки
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // ссылки: оставляем текст
    .replace(/<[^>]+>/g, ' ') // html
    .replace(/[#>*_`|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const GET: APIRoute = async () => {
  const posts = await getPosts();
  const index = posts.map((p) => ({
    url: `/posts/${p.id}/`,
    title: p.data.title,
    excerpt: p.data.excerpt,
    tags: p.data.tags,
    text: plain(p.body),
  }));
  return new Response(JSON.stringify(index), { headers: { 'content-type': 'application/json; charset=utf-8' } });
};
