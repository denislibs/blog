// Демо к статье о принципах моушна. В markdown: <div data-demo="motion" data-kind="squash"></div>.
// Почти каждое демо показывает две дорожки рядом: без принципа и с ним, и запускает их одновременно.
// Анимируем только transform и opacity, как советует гайдлайн.
import { onPage, reduceMotion } from './ui';

type Lane = { label: string; build?: (track: HTMLElement) => HTMLElement; play: (el: HTMLElement, track: HTMLElement) => void };
type Kind = { lanes: Lane[]; height?: number; note?: string };

const EASE_OUT = 'cubic-bezier(.16, 1, .3, 1)';
const EASE_IN_OUT = 'cubic-bezier(.65, 0, .35, 1)';

const runOf = (track: HTMLElement, size = 34) => Math.max(40, track.clientWidth - size - 20);
const ball = (track: HTMLElement, cls = 'mo-ball') => {
  const el = document.createElement('span');
  el.className = cls;
  track.append(el);
  return el;
};
function play(el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
  el.getAnimations().forEach((a) => a.cancel());
  return el.animate(frames, { fill: 'forwards', ...options, duration: reduceMotion.matches ? 1 : options.duration });
}

// пружина, сэмплированная на 60 fps
function spring(from: number, to: number, stiffness = 260, damping = 14) {
  let x = from;
  let v = 0;
  const out: number[] = [];
  for (let i = 0; i < 900; i++) {
    v += (-stiffness * (x - to) - damping * v) / 240;
    x += v / 240;
    if (i % 4 === 0) out.push(x);
    if (i > 60 && Math.abs(x - to) < 0.05 && Math.abs(v) < 0.5) break;
  }
  out.push(to);
  return out;
}

const KINDS: Record<string, Kind> = {
  // сжатие и растяжение: мяч падает, отскакивает и сплющивается при ударе
  squash: {
    height: 150,
    lanes: [false, true].map((on) => ({
      label: on ? 'Со сжатием и растяжением' : 'Жёсткий мяч',
      build: (t) => ball(t, 'mo-ball drop'),
      play: (el, t) => {
        const H = t.clientHeight - 38;
        const k = (y: number, sx: number, sy: number, offset: number, easing?: string): Keyframe => ({
          transform: `translateY(${y}px) scale(${on ? sx : 1}, ${on ? sy : 1})`, offset, ...(easing ? { easing } : {}),
        });
        const fall = 'cubic-bezier(.55,0,1,.45)';
        const rise = 'cubic-bezier(0,.55,.45,1)';
        play(el, [
          k(0, 1, 1, 0, fall), k(H, 0.82, 1.2, 0.3), k(H, 1.35, 0.68, 0.34), k(H, 1, 1, 0.4, rise),
          k(H * 0.45, 0.95, 1.06, 0.62, fall), k(H, 0.9, 1.12, 0.8), k(H, 1.18, 0.82, 0.83), k(H, 1, 1, 0.9), k(H, 1, 1, 1),
        ], { duration: 1500, easing: 'linear' });
      },
    })),
  },
  // предвосхищение: перед рывком небольшой замах назад
  anticipation: {
    lanes: [false, true].map((on) => ({
      label: on ? 'С замахом' : 'Сразу',
      build: (t) => ball(t, 'mo-ball square'),
      play: (el, t) => {
        const run = runOf(t);
        play(
          el,
          on
            ? [
                { transform: 'translateX(0) scale(1, 1)', offset: 0, easing: 'cubic-bezier(.3,0,.5,1)' },
                { transform: 'translateX(-14px) scale(.86, 1.1)', offset: 0.35, easing: 'cubic-bezier(.2,.9,.3,1.15)' },
                { transform: `translateX(${run}px) scale(1, 1)`, offset: 1 },
              ]
            : [{ transform: 'translateX(0)' }, { transform: `translateX(${run}px)` }],
          { duration: on ? 900 : 650, easing: on ? 'linear' : EASE_OUT },
        );
      },
    })),
  },
  // доводка: карточка остановилась, а её содержимое по инерции чуть проезжает дальше и возвращается
  follow: {
    lanes: [false, true].map((on) => ({
      label: on ? 'С доводкой' : 'Всё вместе',
      build: (t) => {
        const card = document.createElement('span');
        card.className = 'mo-card';
        card.innerHTML = '<i></i><i></i><i></i>';
        t.append(card);
        return card;
      },
      play: (card, t) => {
        const run = runOf(t, 70);
        play(card, [
          { transform: 'translateX(0)', offset: 0, easing: EASE_IN_OUT },
          { transform: `translateX(${run}px)`, offset: 0.65 },
          { transform: `translateX(${run}px)`, offset: 1 },
        ], { duration: 1200 });
        card.querySelectorAll('i').forEach((line, i) => {
          if (!on) return play(line, [{ transform: 'none' }, { transform: 'none' }], { duration: 1 });
          play(line, [
            { transform: 'translateX(0)', offset: 0 },
            { transform: `translateX(${-6 - i * 3}px)`, offset: 0.25 },
            { transform: 'translateX(0)', offset: 0.55 },
            { transform: `translateX(${8 + i * 4}px)`, offset: 0.72 },
            { transform: `translateX(${-3 - i}px)`, offset: 0.86 },
            { transform: 'translateX(0)', offset: 1 },
          ], { duration: 1200, delay: i * 30, easing: 'ease-in-out' });
        });
      },
    })),
  },
  // разгон и торможение
  easing: {
    lanes: [
      { label: 'Линейно', easing: 'linear' },
      { label: 'Плавно: ease-in-out', easing: EASE_IN_OUT },
      { label: 'Пружина', easing: 'spring' },
    ].map(({ label, easing }) => ({
      label,
      build: (t) => ball(t),
      play: (el, t) => {
        const run = runOf(t);
        if (easing === 'spring') {
          const xs = spring(0, run);
          play(el, xs.map((x) => ({ transform: `translateX(${x.toFixed(1)}px)` })), { duration: xs.length * (1000 / 60), easing: 'linear' });
        } else play(el, [{ transform: 'translateX(0)' }, { transform: `translateX(${run}px)` }], { duration: 900, easing });
      },
    })),
  },
  // дуги: по прямой против по дуге (две вложенные анимации с разными кривыми дают дугу)
  arcs: {
    height: 120,
    lanes: [false, true].map((on) => ({
      label: on ? 'По дуге' : 'По прямой',
      build: (t) => {
        const outer = document.createElement('span');
        outer.className = 'mo-arc';
        outer.innerHTML = '<span class="mo-ball"></span>';
        t.append(outer);
        return outer;
      },
      play: (outer, t) => {
        const run = runOf(t);
        const rise = t.clientHeight - 46;
        const inner = outer.firstElementChild as HTMLElement;
        play(outer, [{ transform: 'translateX(0)' }, { transform: `translateX(${run}px)` }], { duration: 1000, easing: on ? 'cubic-bezier(.45,0,.75,1)' : EASE_IN_OUT });
        play(inner, [{ transform: 'translateY(0)' }, { transform: `translateY(${-rise}px)` }], { duration: 1000, easing: on ? 'cubic-bezier(.15,.75,.35,1)' : EASE_IN_OUT });
      },
    })),
  },
  // тайминг: одно и то же движение с разной длительностью
  timing: {
    lanes: [
      [150, 'Слишком быстро, 150 мс'],
      [350, 'В самый раз, 350 мс'],
      [1400, 'Слишком медленно, 1,4 с'],
    ].map(([ms, label]) => ({
      label: label as string,
      build: (t) => ball(t),
      play: (el, t) => play(el, [{ transform: 'translateX(0)' }, { transform: `translateX(${runOf(t)}px)` }], { duration: ms as number, easing: EASE_OUT }),
    })),
  },
  // каскад: элементы группы появляются по очереди
  stagger: {
    height: 70,
    lanes: [false, true].map((on) => ({
      label: on ? 'Каскадом' : 'Все разом',
      build: (t) => {
        const row = document.createElement('span');
        row.className = 'mo-row';
        row.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
        t.append(row);
        return row;
      },
      play: (row) =>
        row.querySelectorAll('i').forEach((item, i) =>
          play(item, [{ opacity: 0, transform: 'translateY(14px) scale(.96)' }, { opacity: 1, transform: 'none' }], {
            duration: 420, delay: on ? i * 60 : 0, easing: EASE_OUT, fill: 'both',
          }),
        ),
    })),
  },
  // происхождение: панель вырастает из кнопки, которая её вызвала
  origin: {
    height: 130,
    lanes: [false, true].map((on) => ({
      label: on ? 'Из кнопки' : 'Из ниоткуда',
      build: (t) => {
        const btn = document.createElement('span');
        btn.className = 'mo-origin-btn';
        btn.textContent = '+';
        const panel = document.createElement('span');
        panel.className = 'mo-panel';
        panel.innerHTML = '<i></i><i></i><i></i>';
        t.append(btn, panel);
        return panel;
      },
      play: (panel) => {
        panel.style.transformOrigin = on ? '0% 100%' : '50% 50%';
        play(
          panel,
          on
            ? [{ opacity: 0, transform: 'translate(-20px, 20px) scale(.12)' }, { opacity: 1, transform: 'none' }]
            : [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }],
          { duration: on ? 520 : 300, easing: EASE_OUT, fill: 'both' },
        );
      },
    })),
  },
};

function compare(root: HTMLElement, kind: Kind) {
  root.className = 'demo mo';
  root.innerHTML = `<div class="mo-lanes"></div><div class="mo-ctrl"><button type="button" class="demo-btn primary">▶ Запустить</button></div>`;
  const lanesBox = root.querySelector<HTMLElement>('.mo-lanes')!;
  const items = kind.lanes.map((lane) => {
    const wrap = document.createElement('div');
    wrap.className = 'mo-lane';
    const label = document.createElement('small');
    label.textContent = lane.label;
    const track = document.createElement('div');
    track.className = 'mo-track';
    if (kind.height) track.style.height = `${kind.height}px`;
    wrap.append(label, track);
    lanesBox.append(wrap);
    return { lane, track, el: null as HTMLElement | null };
  });
  // строим содержимое после того, как дорожки появились на странице и у них есть размеры
  items.forEach((it) => (it.el = it.lane.build ? it.lane.build(it.track) : it.track));
  root.querySelector('.demo-btn')!.addEventListener('click', () => items.forEach((it) => it.lane.play(it.el!, it.track)));
}

/* ---------- прерываемая анимация: переключатель ---------- */
function interrupt(root: HTMLElement) {
  root.className = 'demo mo';
  root.innerHTML = `<div class="mo-lanes">${[false, true]
    .map(
      (on) => `<div class="mo-lane"><small>${on ? 'Можно прервать' : 'Нельзя прервать'}</small>
      <button type="button" class="mo-switch" data-on="${on}" aria-pressed="false" aria-label="${on ? 'Переключатель, который можно прервать' : 'Переключатель, который нельзя прервать'}"><span></span></button></div>`,
    )
    .join('')}</div><p class="demo-note">Щёлкай по переключателям быстро, несколько раз подряд. Анимация специально медленная.</p>`;
  root.querySelectorAll<HTMLButtonElement>('.mo-switch').forEach((sw) => {
    const knob = sw.firstElementChild as HTMLElement;
    const interruptible = sw.dataset.on === 'true';
    let state = false;
    let busy = false;
    const xOf = () => new DOMMatrixReadOnly(getComputedStyle(knob).transform).m41;
    sw.addEventListener('click', () => {
      if (!interruptible && busy) return; // ждём, пока анимация доиграет
      state = !state;
      sw.setAttribute('aria-pressed', String(state));
      const to = state ? sw.clientWidth - knob.offsetWidth - 8 : 0;
      const from = xOf(); // начинаем с того места, где ручка сейчас, а не с края
      busy = true;
      const a = play(knob, [{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], {
        duration: interruptible ? 900 * (Math.abs(to - from) / Math.max(1, sw.clientWidth - knob.offsetWidth - 8)) + 1 : 900,
        easing: EASE_OUT,
      });
      a.finished.then(() => (busy = false), () => {});
      sw.classList.toggle('on', state);
    });
  });
}

/* ---------- резинка на краю ---------- */
function rubber(root: HTMLElement) {
  root.className = 'demo mo';
  root.innerHTML = `<div class="mo-lanes">${[false, true]
    .map(
      (on) => `<div class="mo-lane"><small>${on ? 'С резинкой' : 'Жёсткий край'}</small>
      <div class="mo-track mo-drag-track"><span class="mo-drag" data-rubber="${on}">тяни</span></div></div>`,
    )
    .join('')}</div><p class="demo-note">Тяни плашку за края дорожки, влево или вправо.</p>`;
  root.querySelectorAll<HTMLElement>('.mo-drag').forEach((el) => {
    const track = el.parentElement!;
    const rubberOn = el.dataset.rubber === 'true';
    let x = 0;
    let startX = 0;
    let startPos = 0;
    let dragging = false;
    const max = () => track.clientWidth - el.offsetWidth - 16;
    const set = (v: number) => (el.style.transform = `translateX(${v}px)`);
    // за краем движение даётся всё тяжелее: чем дальше тянешь, тем меньше двигается
    const resist = (over: number) => Math.sign(over) * (1 - 1 / (Math.abs(over) / 120 + 1)) * 120;
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.getAnimations().forEach((a) => a.cancel());
      startX = e.clientX;
      startPos = x;
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const raw = startPos + e.clientX - startX;
      const m = max();
      if (raw < 0) x = rubberOn ? resist(raw) : 0;
      else if (raw > m) x = rubberOn ? m + resist(raw - m) : m;
      else x = raw;
      set(x);
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      const target = Math.min(max(), Math.max(0, x));
      if (target !== x) {
        const xs = spring(x, target, 300, 22);
        el.style.transform = `translateX(${target}px)`;
        el.animate(xs.map((v) => ({ transform: `translateX(${v.toFixed(1)}px)` })), { duration: xs.length * (1000 / 60), easing: 'linear' });
        x = target;
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  });
}

/* ---------- порог Доэрти: как ощущается задержка ответа ---------- */
function doherty(root: HTMLElement) {
  root.className = 'demo mo';
  root.innerHTML = `<div class="mo-doherty">${[100, 400, 1500]
    .map(
      (ms) => `<div class="mo-lane"><small>Ответ через ${ms < 1000 ? ms + ' мс' : (ms / 1000).toLocaleString('ru') + ' с'}</small>
      <button type="button" class="demo-btn mo-do" data-ms="${ms}">Сохранить</button><span class="mo-do-res"></span></div>`,
    )
    .join('')}</div><p class="demo-note">Нажми все три по очереди и сравни ощущения.</p>`;
  root.querySelectorAll<HTMLButtonElement>('.mo-do').forEach((btn) => {
    const res = btn.nextElementSibling as HTMLElement;
    btn.addEventListener('click', () => {
      btn.disabled = true;
      res.textContent = '';
      setTimeout(() => {
        btn.disabled = false;
        res.textContent = 'Сохранено ✓';
        res.animate([{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 250, easing: EASE_OUT });
      }, Number(btn.dataset.ms));
    });
  });
}

onPage(() => {
  document.querySelectorAll<HTMLElement>('[data-demo="motion"]').forEach((root) => {
    const kind = root.dataset.kind!;
    if (kind === 'interrupt') interrupt(root);
    else if (kind === 'rubber') rubber(root);
    else if (kind === 'doherty') doherty(root);
    else if (KINDS[kind]) compare(root, KINDS[kind]);
  });
});
