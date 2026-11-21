// Страница поста: полоска прогресса, оглавление с подсветкой текущего раздела и якоря у заголовков.
// Чтения геометрии и записи разведены по правилам из гайдлайна: на скролл только один rAF за кадр,
// сначала все измерения, потом все записи.
import { copyText, onPage, reduceMotion, toast } from './ui';

onPage((signal) => {
  const md = document.querySelector<HTMLElement>('.md');
  if (!md) return;
  addAnchors(md, signal);

  const bar = document.querySelector<HTMLElement>('.read-progress span');
  const toc = document.querySelector<HTMLElement>('.toc');
  const links = toc ? [...toc.querySelectorAll<HTMLAnchorElement>('a[data-toc]')] : [];
  const heads = links.map((a) => document.getElementById(a.dataset.toc!)).filter(Boolean) as HTMLElement[];
  let active = '';
  let scheduled = false;

  function update() {
    scheduled = false;
    // чтения
    const rect = md!.getBoundingClientRect();
    const total = rect.height - innerHeight * 0.6;
    const progress = Math.min(1, Math.max(0, -rect.top / Math.max(1, total)));
    let current = heads[0]?.id ?? '';
    for (const h of heads) if (h.getBoundingClientRect().top <= 120) current = h.id;
    // записи
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (current !== active) {
      active = current;
      links.forEach((a) => {
        const on = a.dataset.toc === current;
        a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }
  }
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(update);
  };
  addEventListener('scroll', schedule, { passive: true, signal });
  addEventListener('resize', schedule, { passive: true, signal });
  schedule();

  links.forEach((a) =>
    a.addEventListener(
      'click',
      (e) => {
        e.preventDefault();
        const target = document.getElementById(a.dataset.toc!);
        target?.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
        history.replaceState(history.state, '', `#${a.dataset.toc}`);
      },
      { signal },
    ),
  );
});

// значок # у заголовков: копирует ссылку прямо на раздел
function addAnchors(md: HTMLElement, signal: AbortSignal) {
  md.querySelectorAll<HTMLElement>('h2[id], h3[id]').forEach((h) => {
    if (h.querySelector('.hash')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hash';
    btn.textContent = '#';
    btn.setAttribute('aria-label', `Скопировать ссылку на раздел «${h.textContent}»`);
    h.append(btn);
  });
  md.addEventListener(
    'click',
    async (e) => {
      const btn = (e.target as Element).closest<HTMLButtonElement>('.hash');
      if (!btn) return;
      const id = btn.parentElement!.id;
      const url = `${location.origin}${location.pathname}#${id}`;
      history.replaceState(history.state, '', `#${id}`);
      toast((await copyText(url)) ? 'Ссылка на раздел скопирована' : url);
    },
    { signal },
  );
}
