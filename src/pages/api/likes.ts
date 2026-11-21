import type { APIRoute } from 'astro';
import { getPosts } from '../../lib/posts';
import { getLikes, changeLike } from '../../lib/likes';

// Эта страница работает на сервере, всё остальное — статика
export const prerender = false;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// Кроме лайка у поста есть реакции. Счётчик реакции хранится под ключом `slug~kind`, лайк просто под `slug`.
const REACTIONS = new Set(['fire', 'mind', 'eyes']);

async function knownSlugs() {
  return new Set((await getPosts()).map((p) => p.id));
}

function isValidId(id: unknown, known: Set<string>): id is string {
  if (typeof id !== 'string') return false;
  const [slug, kind, extra] = id.split('~');
  return known.has(slug) && extra === undefined && (kind === undefined || REACTIONS.has(kind));
}

// GET /api/likes?slugs=a,b~fire,c → { "a": 3, "b~fire": 0, "c": 12 }
export const GET: APIRoute = async ({ url }) => {
  const known = await knownSlugs();
  const slugs = (url.searchParams.get('slugs') ?? '')
    .split(',')
    .filter((s) => isValidId(s, known))
    .slice(0, 100);
  return json(await getLikes(slugs));
};

// Не больше 30 лайков/отмен с одного IP за 10 минут
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 30;
const hits = new Map<string, number[]>();
function isLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

// POST /api/likes  { "slug": "perf-120fps", "action": "like" | "unlike" } → { "slug": "...", "count": 13 }
export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: { slug?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Тело запроса должно быть JSON' }, 400);
  }
  const { slug, action } = body ?? {};
  if (!isValidId(slug, await knownSlugs())) {
    return json({ error: 'Такой записи нет' }, 404);
  }
  if (action !== 'like' && action !== 'unlike') {
    return json({ error: 'action должен быть like или unlike' }, 400);
  }

  // За nginx/Caddy поставь TRUST_PROXY=1, иначе все запросы придут с IP прокси.
  // Без прокси заголовку не верим: его может подделать кто угодно.
  let ip = 'unknown';
  try {
    const forwarded = process.env.TRUST_PROXY ? request.headers.get('x-forwarded-for')?.split(',')[0].trim() : '';
    ip = forwarded || clientAddress;
  } catch {}
  if (isLimited(ip)) return json({ error: 'Слишком много запросов, попробуй через пару минут' }, 429);

  const count = await changeLike(slug, action === 'like' ? 1 : -1);
  return json({ slug, count });
};
