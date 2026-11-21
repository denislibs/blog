// Поиск по Ctrl+K / ⌘K. Индекс /search.json грузится при первом открытии и дальше живёт в памяти.
import { navigate } from 'astro:transitions/client';

type Entry = { url: string; title: string; excerpt: string; tags: string[]; text: string };

let index: Entry[] | null = null;
let loading: Promise<Entry[]> | null = null;
let results: Entry[] = [];
let selected = 0;

const loadIndex = () =>
  (loading ??= fetch('/search.json')
    .then((r) => r.json() as Promise<Entry[]>)
    .then((data) => (index = data))
    .catch(() => (index = [])));

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function highlight(text: string, words: string[]) {
  let html = escapeHtml(text);
  for (const w of words) html = html.replace(new RegExp(`(${escapeRe(escapeHtml(w))})`, 'gi'), '<mark>$1</mark>');
  return html;
}

// кусочек текста поста вокруг первого найденного слова
function snippet(e: Entry, words: string[]) {
  const lower = e.text.toLowerCase();
  const at = Math.min(...words.map((w) => lower.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return e.excerpt;
  const start = Math.max(0, at - 50);
  return (start > 0 ? '…' : '') + e.text.slice(start, start + 140) + '…';
}

function render() {
  const input = document.getElementById('pal-q') as HTMLInputElement;
  const list = document.getElementById('pal-list')!;
  const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!index) {
    list.innerHTML = '<li class="pal-empty">Загружаю…</li>';
    return;
  }
  results = index
    .map((e) => {
      const head = `${e.title} ${e.excerpt} ${e.tags.join(' ')}`.toLowerCase();
      const all = `${head} ${e.text.toLowerCase()}`;
      if (!words.every((w) => all.includes(w))) return null;
      const score = words.reduce(
        (s, w) => s + (e.title.toLowerCase().includes(w) ? 5 : 0) + (e.tags.some((t) => t.includes(w)) ? 3 : 0) + (head.includes(w) ? 2 : 1),
        0,
      );
      return { e, score };
    })
    .filter((x): x is { e: Entry; score: number } => !!x)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.e);
  selected = 0;
  list.innerHTML = results.length
    ? results
        .map(
          (e, i) =>
            `<li role="option" id="pal-opt-${i}" aria-selected="${i === 0}"><b>${highlight(e.title, words)}</b><span>${highlight(
              words.length ? snippet(e, words) : e.excerpt,
              words,
            )}</span></li>`,
        )
        .join('')
    : '<li class="pal-empty">Ничего не нашлось. Попробуй «кадр» или «react».</li>';
  input.setAttribute('aria-activedescendant', results.length ? 'pal-opt-0' : '');
}

function select(i: number) {
  if (!results.length) return;
  selected = (i + results.length) % results.length;
  const list = document.getElementById('pal-list')!;
  list.querySelectorAll('li[role="option"]').forEach((li, k) => li.setAttribute('aria-selected', String(k === selected)));
  list.querySelector(`#pal-opt-${selected}`)?.scrollIntoView({ block: 'nearest' });
  document.getElementById('pal-q')!.setAttribute('aria-activedescendant', `pal-opt-${selected}`);
}

function openResult(i: number) {
  const entry = results[i];
  if (!entry) return;
  (document.getElementById('palette') as HTMLDialogElement).close();
  navigate(entry.url);
}

export async function openSearch() {
  const dlg = document.getElementById('palette') as HTMLDialogElement | null;
  if (!dlg || dlg.open) return;
  const input = document.getElementById('pal-q') as HTMLInputElement;
  input.value = '';
  dlg.showModal();
  input.focus();
  render();
  if (!index) {
    await loadIndex();
    render();
  }
}

// палитра живёт в макете и пересоздаётся при каждой смене страницы, поэтому слушатели вешаем делегированием
document.addEventListener('input', (e) => {
  if ((e.target as Element).id === 'pal-q') render();
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    openSearch();
    return;
  }
  if ((e.target as Element).id !== 'pal-q') return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    select(selected + 1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    select(selected - 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    openResult(selected);
  }
});
document.addEventListener('click', (e) => {
  const target = e.target as Element;
  if (target.closest('#search-open')) {
    openSearch();
    return;
  }
  const li = target.closest<HTMLLIElement>('#pal-list li[role="option"]');
  if (li) openResult(Number(li.id.split('-').pop()));
  // клик по затемнению вокруг окна закрывает его
  if (target.id === 'palette') (target as HTMLDialogElement).close();
});
// подгружаем индекс заранее, когда браузер свободен
if ('requestIdleCallback' in window) requestIdleCallback(() => loadIndex());
