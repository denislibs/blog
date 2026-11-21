// Анимация лайка «Фонтан».
// Главное сердце выпрыгивает на пружине, вверх бьёт фонтан сердечек, которые кувыркаются
// и падают обратно под гравитацией. При отмене вниз падает маленькое серое сердечко.
// Траекторию каждого сердечка считаем заранее простой физикой и отдаём браузеру как
// keyframes для transform и opacity: так всё крутится на композиторе, без Layout и Paint.
import { HEART_PATH } from '../lib/heart';

const NS = 'http://www.w3.org/2000/svg';
const PARTICLE_GRADIENTS = 5; // like-grad-1 … like-grad-5 в LikeDefs.astro
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const rand = (a: number, b: number) => a + Math.random() * (b - a);

type State = { x: number; y: number; r: number; s: number; o: number };

/* ---------- физика ---------- */

// пружина, сэмплированная на 60 fps: позиции и скорости
function spring(from: number, to: number, stiffness = 340, damping = 12) {
  let x = from;
  let v = 0;
  const xs: number[] = [];
  const vs: number[] = [];
  const dt = 1 / 240;
  for (let i = 0; i < 960; i++) {
    v += (-stiffness * (x - to) - damping * v) * dt;
    x += v * dt;
    if (i % 4 === 0) {
      xs.push(x);
      vs.push(v);
    }
    if (i > 60 && Math.abs(x - to) < 0.0015 && Math.abs(v) < 0.02) break;
  }
  xs.push(to);
  vs.push(0);
  return { xs, vs, duration: xs.length * (1000 / 60) };
}

// 0 → 1 с небольшим перелётом за len секунд
function popIn(t: number, len: number) {
  if (t >= len) return 1;
  const k = t / len;
  return Math.sin((k * Math.PI) / 2) * (1 + 0.25 * Math.sin(k * Math.PI));
}

// 1, а с доли `from` от общего времени плавно уходит в 0
function fadeOut(t: number, total: number, from: number) {
  if (t < total * from) return 1;
  return Math.max(0, 1 - (t - total * from) / (total * (1 - from)));
}

// одно сердечко фонтана: вылет вверх, вращение, гравитация, сопротивление воздуха
function simulateFountain(total: number, tiny: boolean): State[] {
  const step = 1 / 30;
  let x = 12 + rand(-2, 2);
  let y = 11;
  let vx = rand(-68, 68);
  let vy = rand(-165, -125);
  let r = rand(-20, 20);
  const spin = vx * 5 + rand(-70, 70);
  const size = tiny ? rand(0.13, 0.2) : rand(0.3, 0.52);
  const out: State[] = [];
  for (let t = 0; t <= total + 1e-6; t += step) {
    vy += 240 * step;
    vx *= 1 - 0.5 * step;
    vy *= 1 - 0.3 * step;
    x += vx * step;
    y += vy * step;
    r += spin * step;
    out.push({ x, y, r, s: size * popIn(t, 0.12), o: Math.min(1, t / 0.05) * fadeOut(t, total, 0.55) });
  }
  return out;
}

/* ---------- отрисовка ---------- */

// у пути сердца центр в (12, 12.1); x, y в State это центр сердечка в координатах слоя эффектов
const toKeyframes = (states: State[]): Keyframe[] =>
  states.map((s) => ({
    transform: `translate(${(s.x - 12).toFixed(2)}px, ${(s.y - 12.1).toFixed(2)}px) rotate(${s.r.toFixed(1)}deg) scale(${s.s.toFixed(3)})`,
    opacity: +Math.max(0, Math.min(1, s.o)).toFixed(3),
  }));

function particle(fx: SVGSVGElement, paint: string, outline = false) {
  const g = document.createElementNS(NS, 'g');
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', HEART_PATH);
  if (outline) {
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', paint);
    p.setAttribute('stroke-width', '2.6');
    p.setAttribute('stroke-linejoin', 'round');
  } else {
    p.setAttribute('fill', paint);
  }
  g.append(p);
  fx.append(g);
  return g;
}

function playAndRemove(el: Element, frames: Keyframe[], options: KeyframeAnimationOptions) {
  el.animate(frames, options).finished.then(
    () => el.remove(),
    () => el.remove(),
  );
}

/* ---------- публичное API ---------- */

export function playLike(btn: HTMLElement) {
  if (reduceMotion.matches) return;
  const fill = btn.querySelector<SVGPathElement>('.like-fill');
  const fx = btn.querySelector<SVGSVGElement>('.like-fx');
  if (!fill || !fx) return;

  // главное сердце: пружина с лёгким сжатием и растяжением
  fill.getAnimations().forEach((a) => a.cancel());
  const { xs, vs, duration } = spring(0, 1);
  const vmax = Math.max(...vs.map(Math.abs)) || 1;
  fill.animate(
    xs.map((s, i) => {
      const k = Math.max(-1, Math.min(1, vs[i] / vmax)) * 0.2;
      return { transform: `scale(${Math.max(0, s * (1 - k)).toFixed(3)}, ${Math.max(0, s * (1 + k)).toFixed(3)})`, opacity: 1 };
    }),
    { duration, easing: 'linear' },
  );

  // фонтан: 10 сердечек, из них пара контурных, и 6 крошек
  for (let i = 0; i < 16; i++) {
    const tiny = i >= 10;
    const total = rand(1.05, 1.35);
    const paint = `url(#like-grad-${(i % PARTICLE_GRADIENTS) + 1})`;
    const g = particle(fx, paint, !tiny && i % 5 === 4);
    playAndRemove(g, toKeyframes(simulateFountain(total, tiny)), {
      duration: total * 1000,
      delay: i * 18,
      easing: 'linear',
      fill: 'both',
    });
  }
}

export function playUnlike(btn: HTMLElement) {
  if (reduceMotion.matches) return;
  const fill = btn.querySelector<SVGPathElement>('.like-fill');
  const fx = btn.querySelector<SVGSVGElement>('.like-fx');
  if (!fill || !fx) return;

  fill.getAnimations().forEach((a) => a.cancel());
  fill.animate(
    [
      { transform: 'scale(1)', opacity: 1 },
      { transform: 'scale(1.1, .85)', opacity: 1, offset: 0.3 },
      { transform: 'scale(.5)', opacity: 0 },
    ],
    { duration: 260, easing: 'ease-in' },
  );

  // грустное серое сердечко падает вниз
  const g = particle(fx, '#b9bcc4');
  playAndRemove(
    g,
    [
      { transform: 'translate(0px, 0px) rotate(0deg) scale(.4)', opacity: 0.95 },
      { transform: 'translate(1px, 5px) rotate(8deg) scale(.36)', opacity: 0.9, offset: 0.35 },
      { transform: 'translate(3px, 18px) rotate(26deg) scale(.3)', opacity: 0 },
    ],
    { duration: 700, easing: 'cubic-bezier(.45,0,.8,.6)' },
  );
}

// реакция: эмодзи подпрыгивает, а при включении из кнопки вылетает фонтанчик таких же эмодзи
export function playEmoji(btn: HTMLElement, on: boolean) {
  if (reduceMotion.matches) return;
  const emoji = btn.querySelector<HTMLElement>('.react-e');
  if (!emoji) return;
  emoji.getAnimations().forEach((a) => a.cancel());
  emoji.animate(
    on
      ? [{ transform: 'scale(1)' }, { transform: 'scale(1.45) rotate(-8deg)', offset: 0.4 }, { transform: 'scale(1)' }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(.8)', offset: 0.4 }, { transform: 'scale(1)' }],
    { duration: on ? 420 : 260, easing: 'cubic-bezier(.3,1.6,.5,1)' },
  );
  if (!on) return;
  for (let i = 0; i < 7; i++) {
    const f = document.createElement('span');
    f.className = 'react-fly';
    f.textContent = emoji.textContent;
    f.setAttribute('aria-hidden', 'true');
    btn.append(f);
    const dx = rand(-35, 35);
    const dy = rand(-80, -40);
    const rot = rand(-30, 30);
    const s = rand(0.6, 1.1);
    playAndRemove(
      f,
      [
        { transform: 'translate(0, 0) scale(.3)', opacity: 0 },
        { transform: `translate(${dx * 0.4}px, ${dy * 0.5}px) scale(${s}) rotate(${rot / 2}deg)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${dx}px, ${dy}px) scale(${s * 0.8}) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: rand(800, 1200), delay: i * 30, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'backwards' },
    );
  }
}

// счётчик: старое число уезжает, новое приезжает (вверх при лайке, вниз при отмене)
export function setCount(el: HTMLElement, value: string) {
  el.dataset.value = value;
  const span = document.createElement('span');
  span.textContent = value;
  el.replaceChildren(span);
}

export function rollCount(el: HTMLElement, value: string, dir: 1 | -1) {
  if (reduceMotion.matches || !el.firstElementChild) return setCount(el, value);
  el.dataset.value = value;
  while (el.children.length > 1) el.firstElementChild!.remove();
  const old = el.firstElementChild as HTMLElement;
  const next = document.createElement('span');
  next.textContent = value;
  el.append(next);
  const out = dir > 0 ? '-100%' : '100%';
  const from = dir > 0 ? '100%' : '-100%';
  playAndRemove(
    old,
    [
      { transform: 'translateY(0)', opacity: 1 },
      { transform: `translateY(${out})`, opacity: 0 },
    ],
    { duration: 240, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' },
  );
  next.animate(
    [
      { transform: `translateY(${from})`, opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    { duration: 380, delay: 70, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'backwards' },
  );
}
