// Кнопка «Наверх»: появляется, когда прокрутишь примерно на экран вниз.
// Кольцо вокруг стрелки показывает, сколько страницы пройдено.
// На скролл только один rAF за кадр: сначала читаем позицию, потом пишем стили.
import { reduceMotion } from './ui';

const CIRCUMFERENCE = 135.1; // 2π × 21.5, радиус кольца в Base.astro
let scheduled = false;

function update() {
  scheduled = false;
  const btn = document.getElementById('to-top');
  if (!btn) return;
  // чтения
  const max = document.documentElement.scrollHeight - innerHeight;
  const y = scrollY;
  const show = y > innerHeight * 0.9;
  const progress = max > 0 ? Math.min(1, y / max) : 0;
  // записи
  btn.classList.toggle('show', show);
  // пока кнопка спрятана, она недоступна с клавиатуры
  btn.tabIndex = show ? 0 : -1;
  btn.querySelector('.fg')?.setAttribute('stroke-dashoffset', (CIRCUMFERENCE * (1 - progress)).toFixed(2));
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(update);
}

addEventListener('scroll', schedule, { passive: true });
addEventListener('resize', schedule, { passive: true });
// после перехода между страницами кнопка новая, её состояние надо пересчитать
document.addEventListener('astro:page-load', schedule);

document.addEventListener('click', (e) => {
  if (!(e.target as Element).closest('#to-top')) return;
  scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
  // переносим фокус в начало страницы, чтобы Tab продолжался оттуда, а не с низа
  const first = document.querySelector<HTMLElement>('#search-open');
  first?.focus({ preventScroll: true });
});
