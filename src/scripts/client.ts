// Клиентская часть: лайки и кнопки «Копировать» у блоков кода.
// Скрипт выполняется один раз; с ClientRouter страницы меняются без перезагрузки,
// поэтому всё, что зависит от DOM, запускаем на каждом astro:page-load.
import { playLike, playUnlike, rollCount, setCount } from './like-fx';
import { syncThemeButton, toggleTheme } from './theme';

const STORAGE_KEY = 'blog.likes';
const counts = new Map<string, number>();
const pending = new Set<string>();

function readLiked(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
function writeLiked(set: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {}
}

function buttons(slug?: string) {
  const sel = slug ? `[data-like="${CSS.escape(slug)}"]` : '[data-like]';
  return [...document.querySelectorAll<HTMLButtonElement>(sel)];
}

// rolled: кнопка, на которой счётчик надо прокрутить, а не просто заменить
function paint(slug: string, rolled?: { btn: HTMLButtonElement; dir: 1 | -1 }) {
  const liked = readLiked().has(slug);
  for (const b of buttons(slug)) {
    b.setAttribute('aria-pressed', String(liked));
    const n = b.querySelector<HTMLElement>('.n');
    if (!n || !counts.has(slug)) continue;
    const value = String(counts.get(slug));
    if (n.dataset.value === value) continue;
    if (rolled && rolled.btn === b) rollCount(n, value, rolled.dir);
    else setCount(n, value);
  }
}

async function loadCounts() {
  const slugs = [...new Set(buttons().map((b) => b.dataset.like!))];
  if (!slugs.length) return;
  slugs.forEach(paint);
  try {
    const res = await fetch(`/api/likes?slugs=${encodeURIComponent(slugs.join(','))}`);
    if (!res.ok) return;
    const data: Record<string, number> = await res.json();
    for (const [slug, c] of Object.entries(data)) counts.set(slug, c);
    slugs.forEach(paint);
  } catch {
    // сервер недоступен — просто не показываем числа
  }
}

async function toggleLike(btn: HTMLButtonElement) {
  const slug = btn.dataset.like!;
  if (pending.has(slug)) return;
  pending.add(slug);

  const liked = readLiked();
  const wasLiked = liked.has(slug);
  const before = counts.get(slug);

  // оптимистично: сразу показываем результат
  wasLiked ? liked.delete(slug) : liked.add(slug);
  writeLiked(liked);
  if (before !== undefined) counts.set(slug, Math.max(0, before + (wasLiked ? -1 : 1)));
  paint(slug, { btn, dir: wasLiked ? -1 : 1 });
  if (wasLiked) playUnlike(btn);
  else playLike(btn);

  try {
    const res = await fetch('/api/likes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, action: wasLiked ? 'unlike' : 'like' }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data: { count: number } = await res.json();
    counts.set(slug, data.count);
  } catch {
    // откатываем, если сервер не принял
    const rollback = readLiked();
    wasLiked ? rollback.add(slug) : rollback.delete(slug);
    writeLiked(rollback);
    if (before !== undefined) counts.set(slug, before);
  } finally {
    pending.delete(slug);
    paint(slug);
  }
}

function enhanceCode() {
  document.querySelectorAll<HTMLPreElement>('.md pre').forEach((pre) => {
    if (pre.parentElement?.classList.contains('code')) return;
    const wrap = document.createElement('div');
    wrap.className = 'code';
    pre.replaceWith(wrap);
    wrap.append(pre);

    const lang = pre.dataset.language;
    if (lang && lang !== 'text' && lang !== 'plaintext') {
      const label = document.createElement('span');
      label.className = 'lang';
      label.textContent = lang;
      wrap.append(label);
    }
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy';
    copy.textContent = 'Копировать';
    wrap.append(copy);
  });
}

async function copyCode(btn: HTMLButtonElement) {
  const code = btn.parentElement?.querySelector('code');
  if (!code) return;
  const say = (text: string) => {
    btn.textContent = text;
    setTimeout(() => (btn.textContent = 'Копировать'), 1500);
  };
  try {
    await navigator.clipboard.writeText(code.innerText);
    say('Скопировано');
  } catch {
    const range = document.createRange();
    range.selectNodeContents(code);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    say('Выделено, нажми Ctrl+C');
  }
}

document.addEventListener('click', (e) => {
  const target = e.target as Element;
  const themeBtn = target.closest<HTMLButtonElement>('#theme-toggle');
  if (themeBtn) {
    toggleTheme(themeBtn);
    return;
  }
  const like = target.closest<HTMLButtonElement>('[data-like]');
  if (like) {
    e.preventDefault();
    toggleLike(like);
    return;
  }
  const copy = target.closest<HTMLButtonElement>('.md .copy');
  if (copy) copyCode(copy);
});

document.addEventListener('astro:page-load', () => {
  syncThemeButton();
  enhanceCode();
  loadCounts();
});
