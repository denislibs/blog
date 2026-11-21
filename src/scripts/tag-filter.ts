// Фильтр по тегам на главной. Посты перестраиваются через FLIP:
// запоминаем старые позиции, прячем лишнее, считаем новые и плавно едем из старых в новые через transform.
import { onPage, reduceMotion } from './ui';

onPage((signal) => {
  const bar = document.querySelector<HTMLElement>('.tag-filter');
  if (!bar) return;
  const items = [...document.querySelectorAll<HTMLElement>('.B-item[data-tags]')];

  bar.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-tag]');
      if (!btn) return;
      const tag = btn.dataset.tag!;
      bar.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));

      // First: где посты сейчас
      const first = new Map(items.filter((el) => !el.hidden).map((el) => [el, el.getBoundingClientRect()]));
      // Last: применяем фильтр
      items.forEach((el) => (el.hidden = !!tag && !el.dataset.tags!.split(' ').includes(tag)));
      if (reduceMotion.matches) return;
      // Invert + Play: одно чтение новых позиций, дальше только transform
      const last = items.filter((el) => !el.hidden).map((el) => [el, el.getBoundingClientRect()] as const);
      last.forEach(([el, r], i) => {
        const f = first.get(el);
        if (f) {
          const dy = f.top - r.top;
          if (dy) el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 450, easing: 'cubic-bezier(.22,1,.36,1)' });
        } else {
          el.animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], {
            duration: 380,
            delay: 60 + i * 30,
            easing: 'cubic-bezier(.22,1,.36,1)',
            fill: 'backwards',
          });
        }
      });
    },
    { signal },
  );
});
