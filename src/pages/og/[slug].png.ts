// Картинка-превью для соцсетей и мессенджеров, по одной на пост. Собирается при сборке.
// satori рисует разметку в SVG (текст сразу превращается в контуры), sharp переводит SVG в PNG.
import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';
import { SITE } from '../../site.config';
import { getPosts, readingTime, type Post } from '../../lib/posts';

const require = createRequire(import.meta.url);
const font = (pkg: string, file: string) => readFile(require.resolve(`${pkg}/files/${file}`));

// грузим шрифты один раз на всю сборку
const fontsPromise = Promise.all([
  font('@fontsource/source-serif-4', 'source-serif-4-latin-500-normal.woff'),
  font('@fontsource/source-serif-4', 'source-serif-4-cyrillic-500-normal.woff'),
  font('@fontsource/inter', 'inter-latin-500-normal.woff'),
  font('@fontsource/inter', 'inter-cyrillic-500-normal.woff'),
]).then(([serifLat, serifCyr, interLat, interCyr]) => [
  // у наборов разные имена: с одинаковым satori берёт только первый файл и теряет кириллицу
  { name: 'SerifCyr', data: serifCyr, weight: 500 as const, style: 'normal' as const },
  { name: 'SerifLat', data: serifLat, weight: 500 as const, style: 'normal' as const },
  { name: 'InterCyr', data: interCyr, weight: 500 as const, style: 'normal' as const },
  { name: 'InterLat', data: interLat, weight: 500 as const, style: 'normal' as const },
]);
const SERIF = 'SerifCyr, SerifLat';
const SANS = 'InterCyr, InterLat';

export async function getStaticPaths() {
  const posts = await getPosts();
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}

// satori принимает дерево в формате React-элементов, без JSX
const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({ type, props: { style, children } });

export const GET: APIRoute = async ({ props }) => {
  const post = (props as { post: Post }).post;
  const title = post.data.title;
  const meta = `${SITE.author.name} · ${readingTime(post.body)} мин · ${post.data.tags.map((t) => '#' + t).join(' ')}`;

  const tree = el(
    'div',
    {
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      padding: '72px 80px', background: '#0b0b0c', color: '#ededee', position: 'relative',
    },
    [
      // мягкое розовое свечение в углу, как у кнопки лайка
      el('div', {
        position: 'absolute', right: -160, top: -220, width: 620, height: 620, borderRadius: 620,
        background: 'radial-gradient(circle, rgba(255,59,92,.42), rgba(255,59,92,0) 65%)',
      }),
      el('div', { display: 'flex', fontFamily: SANS, fontSize: 26, color: '#a3a5ab' }, SITE.title),
      el(
        'div',
        { display: 'flex', fontFamily: SERIF, fontSize: title.length > 48 ? 58 : 68, lineHeight: 1.12, letterSpacing: -1.5, maxWidth: 960 },
        title,
      ),
      el('div', { display: 'flex', alignItems: 'center', gap: 18, fontFamily: SANS, fontSize: 26, color: '#a3a5ab' }, [
        el('div', { width: 44, height: 44, borderRadius: 44, background: 'linear-gradient(135deg, #d7d9de, #585c66)' }),
        meta,
      ]),
    ],
  );

  const svg = await satori(tree as never, { width: 1200, height: 630, fonts: await fontsPromise });
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return new Response(new Uint8Array(png), {
    headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' },
  });
};
