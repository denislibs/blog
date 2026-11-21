// Режим чтения: прячет оглавление и шапку, делает шрифт крупнее. Выбор запоминается.
// Атрибут data-reading на <html> ставит ещё скрипт в <head>, поэтому при загрузке страница не прыгает.
import { onPage, reduceMotion } from './ui';

const root = document.documentElement;

onPage((signal) => {
  const btn = document.getElementById('reading-toggle');
  if (!btn) return;
  const sync = () => btn.setAttribute('aria-pressed', String(root.hasAttribute('data-reading')));
  sync();
  btn.addEventListener(
    'click',
    () => {
      const on = !root.hasAttribute('data-reading');
      const apply = () => {
        if (on) root.dataset.reading = '';
        else delete root.dataset.reading;
        try {
          localStorage.setItem('blog.reading', on ? '1' : '0');
        } catch {}
        sync();
      };
      if (document.startViewTransition && !reduceMotion.matches) document.startViewTransition(apply);
      else apply();
    },
    { signal },
  );
});
