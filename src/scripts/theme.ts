// Переключение темы с переходом «Круг».
// Тёмная тема расходится кругом от кнопки, а при возврате к светлой тёмная сворачивается обратно в кнопку.
// Работает на View Transitions: браузер снимает страницу до и после смены темы,
// а мы анимируем clip-path нового или старого снимка. Без поддержки или при reduced motion тема меняется сразу.

type Theme = 'light' | 'dark';

const root = document.documentElement;
const STORAGE_KEY = 'blog.theme';
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const current = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');

// целевая тема меняется сразу на клике: переход стартует только на следующем кадре,
// и быстрый второй клик иначе посчитал бы тему от старого состояния
let target: Theme | null = null;
// анимации псевдоэлементов переживают сам переход, поэтому после каждого их отменяем
const live: Animation[] = [];
const clearLive = () => live.splice(0).forEach((a) => a.cancel());

function save(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {}
}

export function syncThemeButton() {
  const btn = document.getElementById('theme-toggle');
  btn?.setAttribute('aria-label', current() === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему');
}

export function toggleTheme(btn: HTMLElement) {
  const next: Theme = (target ?? current()) === 'dark' ? 'light' : 'dark';
  target = next;
  const apply = () => {
    root.dataset.theme = next;
    save(next);
    syncThemeButton();
  };

  if (!document.startViewTransition || reduceMotion.matches) {
    apply();
    target = null;
    return;
  }

  const r = btn.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const small = `circle(0px at ${x}px ${y}px)`;
  const big = `circle(${radius}px at ${x}px ${y}px)`;
  const toDark = next === 'dark';

  clearLive();
  // при возврате к светлой сворачиваем старый (тёмный) снимок, он должен лежать сверху
  root.dataset.themeSwitching = toDark ? 'grow' : 'shrink';
  const transition = document.startViewTransition(apply);
  transition.ready
    .then(() => {
      live.push(
        root.animate(
          { clipPath: toDark ? [small, big] : [big, small] },
          {
            duration: toDark ? 650 : 600,
            easing: 'cubic-bezier(.7,0,.3,1)',
            fill: 'both',
            pseudoElement: toDark ? '::view-transition-new(root)' : '::view-transition-old(root)',
          },
        ),
      );
    })
    .catch(() => {});
  transition.finished.finally(() => {
    delete root.dataset.themeSwitching;
    clearLive();
    if (target === next) target = null;
  });
}
