// Общие мелочи для клиентских модулей: уведомление внизу экрана, копирование и жизненный цикл страницы.

export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let toastTimer = 0;
export function toast(text: string) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 2200);
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // запасной путь для браузеров и окон, где Clipboard API недоступен
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    area.remove();
    return ok;
  }
}

// ClientRouter меняет страницы без перезагрузки, поэтому слушатели конкретной страницы
// надо снимать при уходе с неё. setup получает signal, который сработает перед подменой страницы.
export function onPage(setup: (signal: AbortSignal) => void) {
  let controller: AbortController | null = null;
  document.addEventListener('astro:page-load', () => {
    controller?.abort();
    controller = new AbortController();
    setup(controller.signal);
  });
  document.addEventListener('astro:before-swap', () => {
    controller?.abort();
    controller = null;
  });
}
