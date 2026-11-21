// Карточки терминов: наводишь или нажимаешь на подчёркнутый пунктиром термин, рядом появляется объяснение.
import { GLOSSARY } from '../lib/glossary';
import { onPage } from './ui';

onPage((signal) => {
  const terms = [...document.querySelectorAll<HTMLButtonElement>('.md .term')];
  if (!terms.length) return;
  const pop = document.createElement('div');
  pop.className = 'term-pop';
  pop.id = 'term-pop';
  pop.setAttribute('role', 'tooltip');
  document.body.append(pop);
  signal.addEventListener('abort', () => pop.remove());

  let hideTimer = 0;
  let current: HTMLButtonElement | null = null;

  function show(btn: HTMLButtonElement) {
    const entry = GLOSSARY[btn.dataset.term ?? ''];
    if (!entry) return;
    clearTimeout(hideTimer);
    current = btn;
    pop.replaceChildren();
    const b = document.createElement('b');
    b.textContent = entry.title;
    pop.append(b, entry.text);
    // чтения, потом записи
    const r = btn.getBoundingClientRect();
    const w = Math.min(300, innerWidth - 32);
    const left = Math.max(16, Math.min(innerWidth - w - 16, r.left + r.width / 2 - w / 2));
    const below = r.bottom + 10 + 140 < innerHeight;
    pop.style.width = `${w}px`;
    pop.style.left = `${left + scrollX}px`;
    pop.style.top = below ? `${r.bottom + scrollY + 10}px` : `${r.top + scrollY - 10}px`;
    pop.classList.toggle('above', !below);
    pop.classList.add('show');
    btn.setAttribute('aria-describedby', 'term-pop');
  }
  function hide() {
    hideTimer = window.setTimeout(() => {
      pop.classList.remove('show');
      current?.removeAttribute('aria-describedby');
      current = null;
    }, 120);
  }

  terms.forEach((btn) => {
    btn.addEventListener('mouseenter', () => show(btn), { signal });
    btn.addEventListener('mouseleave', hide, { signal });
    btn.addEventListener('focus', () => show(btn), { signal });
    btn.addEventListener('blur', hide, { signal });
    btn.addEventListener('click', () => (current === btn && pop.classList.contains('show') ? hide() : show(btn)), { signal });
  });
  addEventListener('keydown', (e) => e.key === 'Escape' && hide(), { signal });
});
