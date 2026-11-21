import { promises as fs } from 'node:fs';
import path from 'node:path';

// Счётчики лайков в JSON-файле: { "perf-120fps": 12, ... }
// Для личного блога этого хватает. Захочешь масштаб — замени эти две функции на Redis/SQLite/Postgres.
const FILE = path.resolve(process.env.LIKES_FILE ?? 'data/likes.json');

let db: Record<string, number> | null = null;
let writing: Promise<void> = Promise.resolve();

async function load(): Promise<Record<string, number>> {
  if (db) return db;
  try {
    db = JSON.parse(await fs.readFile(FILE, 'utf8'));
  } catch {
    db = {};
  }
  return db!;
}

async function persist(data: Record<string, number>) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, FILE); // атомарная замена: файл не побьётся при падении посреди записи
}

export async function getLikes(slugs: string[]): Promise<Record<string, number>> {
  const data = await load();
  return Object.fromEntries(slugs.map((s) => [s, data[s] ?? 0]));
}

export async function changeLike(slug: string, delta: 1 | -1): Promise<number> {
  const data = await load();
  data[slug] = Math.max(0, (data[slug] ?? 0) + delta);
  // записи идут строго по очереди, чтобы параллельные лайки не затирали друг друга
  writing = writing.then(() => persist(data)).catch((err) => console.error('[likes] не удалось сохранить', err));
  await writing;
  return data[slug];
}
