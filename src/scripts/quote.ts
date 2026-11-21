// «Поделиться цитатой»: выделяешь текст в статье, рядом появляется кнопка.
// Она собирает ссылку с текстовым фрагментом (#:~:text=…): браузер по ней сам прокрутит к фразе и подсветит её.
import { copyText, onPage, toast } from './ui';

onPage((signal) => {
  const md = document.querySelector<HTMLElement>('.md');
  if (!md) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'quote-share';
  btn.textContent = 'Поделиться цитатой';
  document.body.append(btn);
  signal.addEventListener('abort', () => btn.remove());

  let picked = '';
  let timer = 0;
  function check() {
    const sel = getSelection();
    const text = sel && sel.rangeCount ? sel.toString().trim().replace(/\s+/g, ' ') : '';
    if (!sel || text.length < 3 || text.length > 300 || !md!.contains(sel.anchorNode) || !md!.contains(sel.focusNode)) {
      btn.classList.remove('show');
      return;
    }
    picked = text;
    const r = sel.getRangeAt(0).getBoundingClientRect();
    btn.style.left = `${Math.max(90, Math.min(innerWidth - 90, r.left + r.width / 2))}px`;
    btn.style.top = `${r.top + scrollY}px`;
    btn.classList.add('show');
  }
  document.addEventListener(
    'selectionchange',
    () => {
      clearTimeout(timer);
      timer = window.setTimeout(check, 150);
    },
    { signal },
  );
  // не даём кнопке сбросить выделение при нажатии
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#:~:text=${encodeURIComponent(picked)}`;
    btn.classList.remove('show');
    toast((await copyText(url)) ? 'Ссылка на цитату скопирована' : 'Не получилось скопировать, браузер запретил доступ к буферу обмена');
  });
});
