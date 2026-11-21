// Пасхалка: код Konami (↑ ↑ ↓ ↓ ← → ← → B A) включает панель с частотой кадров и графиком
// времени каждого кадра, как в DevTools. Зелёная линия показывает бюджет кадра на 120 Гц.
import { toast } from './ui';

const CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
let pos = 0;
let hud: HTMLElement | null = null;
let raf = 0;

function openHud() {
  if (hud) return;
  hud = document.createElement('div');
  hud.className = 'fps-hud';
  hud.innerHTML = `<header><span><b>0</b> fps</span><button type="button">закрыть ✕</button></header>
    <canvas width="440" height="96"></canvas><small>пунктир: бюджет кадра 8,3 мс</small>`;
  document.body.append(hud);
  requestAnimationFrame(() => hud?.classList.add('show'));
  hud.querySelector('button')!.addEventListener('click', closeHud);
  const canvas = hud.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const fpsEl = hud.querySelector('b')!;
  const times: number[] = [];
  let last = 0;
  let shown = 0;
  const draw = (now: number) => {
    raf = requestAnimationFrame(draw);
    if (last) {
      times.push(now - last);
      if (times.length > 110) times.shift();
    }
    last = now;
    const { width: w, height: h } = canvas;
    const max = 34;
    const bw = w / 110;
    ctx.clearRect(0, 0, w, h);
    times.forEach((t, i) => {
      const bh = Math.min(h, (t / max) * h);
      ctx.fillStyle = t <= 9 ? '#4cc38a' : t <= 17.5 ? '#f0a35e' : '#ff6b6b';
      ctx.fillRect(i * bw, h - bh, Math.max(1, bw - 1), bh);
    });
    const y = h - (8.33 / max) * h;
    ctx.strokeStyle = '#4cc38a';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.setLineDash([]);
    if (now - shown > 250 && times.length) {
      shown = now;
      const recent = times.slice(-30);
      fpsEl.textContent = String(Math.round(1000 / (recent.reduce((a, b) => a + b, 0) / recent.length)));
    }
  };
  raf = requestAnimationFrame(draw);
  toast('Режим 120 fps включён');
}

function closeHud() {
  cancelAnimationFrame(raf);
  hud?.remove();
  hud = null;
}

document.addEventListener('keydown', (e) => {
  if ((e.target as Element).closest?.('input, textarea, dialog')) return;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  pos = key === CODE[pos] ? pos + 1 : key === CODE[0] ? 1 : 0;
  if (pos === CODE.length) {
    pos = 0;
    openHud();
  }
});
// панель переживает переходы между страницами: ClientRouter меняет body, поэтому возвращаем её на место
document.addEventListener('astro:after-swap', () => {
  if (hud) document.body.append(hud);
});
