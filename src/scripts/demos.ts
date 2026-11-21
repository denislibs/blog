// Живые демо внутри статей. В markdown на их месте стоит <div data-demo="…"></div>.
//  frame-lab   — чтение и запись DOM вперемешку против планировщика, со счётчиком кадров
//  event-order — порядок обычного кода, микрозадачи, задачи и requestAnimationFrame
import { onPage } from './ui';

onPage((signal) => {
  document.querySelectorAll<HTMLElement>('[data-demo="frame-lab"]').forEach((el) => frameLab(el, signal));
  document.querySelectorAll<HTMLElement>('[data-demo="event-order"]').forEach((el) => eventOrder(el));
  document.querySelectorAll<HTMLElement>('[data-demo="block"]').forEach((el) => blockDemo(el, signal));
  document.querySelectorAll<HTMLElement>('[data-demo="transition"]').forEach((el) => transitionDemo(el));
  document.querySelectorAll<HTMLElement>('[data-demo="loop-sim"]').forEach((el) => loopSim(el));
  document.querySelectorAll<HTMLElement>('[data-demo="click-order"]').forEach((el) => clickOrder(el));
});

/* ---------- занять главный поток ---------- */
function blockDemo(root: HTMLElement, signal: AbortSignal) {
  root.className = 'demo';
  root.innerHTML = `
    <div class="blk-row">
      <button type="button" class="demo-btn blk-go">Занять поток на 2 секунды</button>
      <span class="blk-status">Повар свободен</span>
    </div>
    <div class="blk-grid">
      <div class="blk-cell"><b class="blk-counter">0</b><span>счётчик на JavaScript</span></div>
      <div class="blk-cell"><i class="blk-spin" aria-hidden="true"></i><span>кружок на CSS</span></div>
      <label class="blk-cell blk-input"><input type="text" placeholder="Попробуй печатать во время блокировки" /><span>поле ввода</span></label>
    </div>`;
  const counter = root.querySelector<HTMLElement>('.blk-counter')!;
  const status = root.querySelector<HTMLElement>('.blk-status')!;
  const go = root.querySelector<HTMLButtonElement>('.blk-go')!;
  let n = 0;
  let raf = 0;
  const tick = () => {
    counter.textContent = String(++n);
    raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !raf) raf = requestAnimationFrame(tick);
    else if (!e.isIntersecting && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  io.observe(root);
  signal.addEventListener('abort', () => {
    io.disconnect();
    cancelAnimationFrame(raf);
  });
  go.addEventListener('click', () => {
    status.textContent = 'Повар занят…';
    go.disabled = true;
    // даём браузеру нарисовать надпись, а потом занимаем поток
    setTimeout(() => {
      const end = performance.now() + 2000;
      while (performance.now() < end) {
        /* одна длинная задача */
      }
      status.textContent = 'Освободился. Всё, что ты нажимал и печатал, обработалось только сейчас.';
      go.disabled = false;
    }, 60);
  });
}

/* ---------- перезапуск CSS-перехода ---------- */
function transitionDemo(root: HTMLElement) {
  root.className = 'demo';
  root.innerHTML = `
    <div class="tr-track"><span class="tr-box"></span></div>
    <div class="tr-btns">
      <button type="button" class="demo-btn" data-mode="same">Сразу, в одной задаче</button>
      <button type="button" class="demo-btn" data-mode="raf">Через два кадра</button>
      <button type="button" class="demo-btn" data-mode="read">С чтением стиля</button>
    </div>
    <p class="demo-note">Квадрат стоит справа. Каждая кнопка возвращает его влево без перехода и отправляет вправо с переходом.</p>`;
  const track = root.querySelector<HTMLElement>('.tr-track')!;
  const box = root.querySelector<HTMLElement>('.tr-box')!;
  const note = root.querySelector<HTMLElement>('.demo-note')!;
  const run = () => `translateX(${Math.max(40, track.clientWidth - 52)}px)`;
  box.style.transition = 'none';
  box.style.transform = run();
  const NOTES: Record<string, string> = {
    same: 'Ничего не произошло: все четыре строчки выполнились в одной задаче, и браузер увидел только итог «справа».',
    raf: 'Сработало: браузер нарисовал кадр с квадратом слева, и только потом мы отправили его вправо.',
    read: 'Тоже сработало: чтение getComputedStyle заставило браузер посчитать стили прямо посреди кода.',
  };
  root.querySelector('.tr-btns')!.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button[data-mode]');
    if (!btn) return;
    const mode = btn.dataset.mode!;
    const fly = () => {
      box.style.transition = '';
      box.style.transform = run();
    };
    box.style.transition = 'none';
    box.style.transform = 'translateX(0)';
    if (mode === 'same') fly();
    else if (mode === 'raf') requestAnimationFrame(() => requestAnimationFrame(fly));
    else {
      void getComputedStyle(box).transform;
      fly();
    }
    note.textContent = NOTES[mode];
  });
}

/* ---------- пошаговый симулятор цикла ---------- */
type SimStep = { line: number; stack: string[]; tasks: string[]; micro: string[]; raf: string[]; log: string[]; frame?: boolean; note: string };

function loopSim(root: HTMLElement) {
  const code = [
    "console.log('A');",
    "setTimeout(() => console.log('B'), 0);",
    "Promise.resolve().then(() => console.log('C'));",
    "requestAnimationFrame(() => console.log('D'));",
    "console.log('E');",
  ];
  const S = (s: Partial<SimStep> & { note: string }, prev?: SimStep): SimStep => ({
    line: -1, stack: [], tasks: [], micro: [], raf: [], log: [], ...(prev ?? {}), frame: false, ...s,
  });
  const steps: SimStep[] = [];
  const add = (s: Partial<SimStep> & { note: string }) => steps.push(S(s, steps[steps.length - 1]));
  add({ stack: ['скрипт'], note: 'Весь скрипт браузер выполняет как одну задачу. Она лежит на стеке вызовов, и пока не закончится, ничего другого не произойдёт.' });
  add({ line: 0, log: ['A'], note: 'Обычный код выполняется сразу: в журнале появляется A.' });
  add({ line: 1, tasks: ['B'], note: 'setTimeout ничего не выполняет, а ставит колбэк в очередь задач. Даже с задержкой 0 он подождёт, пока закончится текущая задача.' });
  add({ line: 2, micro: ['C'], note: 'then ставит колбэк в очередь микрозадач. Её разберут сразу, как только опустеет стек.' });
  add({ line: 3, raf: ['D'], note: 'requestAnimationFrame откладывает колбэк до следующего кадра: он сработает прямо перед расчётом стилей и отрисовкой.' });
  add({ line: 4, log: ['A', 'E'], note: 'Снова обычный код: E. На этом скрипт закончился.' });
  add({ line: -1, stack: ['C'], micro: [], log: ['A', 'E', 'C'], note: 'Стек опустел, и браузер сразу разбирает все микрозадачи. C выполнилась раньше B, хотя setTimeout вызвали раньше.' });
  add({ stack: ['D'], raf: [], log: ['A', 'E', 'C', 'D'], frame: true, note: 'Допустим, как раз подошло время кадра. Сначала колбэки requestAnimationFrame, потом стили, вёрстка и отрисовка.' });
  add({ stack: ['B'], tasks: [], log: ['A', 'E', 'C', 'D', 'B'], note: 'Кадр нарисован, цикл берёт следующую задачу: B. Если бы кадр ещё не подошёл, B выполнилась бы раньше D.' });
  add({ stack: [], note: 'Готово: A, E, C, D, B. Очереди пусты, и цикл ждёт новых задач: кликов, таймеров, ответов сети.' });

  root.className = 'demo sim';
  root.innerHTML = `
    <pre class="sim-code"><code>${code.map((l, i) => `<span class="sim-line" data-i="${i}">${l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>`).join('')}</code></pre>
    <div class="sim-grid">
      <div class="sim-box" data-k="stack"><b>Стек вызовов</b><div class="sim-items"></div></div>
      <div class="sim-box" data-k="micro"><b>Микрозадачи</b><div class="sim-items"></div></div>
      <div class="sim-box" data-k="tasks"><b>Очередь задач</b><div class="sim-items"></div></div>
      <div class="sim-box" data-k="raf"><b>Перед кадром</b><div class="sim-items"></div><span class="sim-frame">кадр рисуется</span></div>
    </div>
    <div class="sim-log"><b>Журнал</b><div class="sim-items"></div></div>
    <p class="demo-note sim-note"></p>
    <div class="sim-ctrl">
      <button type="button" class="demo-btn" data-act="back">← Назад</button>
      <button type="button" class="demo-btn primary" data-act="next">Шаг →</button>
      <button type="button" class="demo-btn" data-act="reset">Сначала</button>
      <span class="sim-count"></span>
    </div>`;
  let i = 0;
  const fill = (key: string, items: string[], prev: string[]) => {
    const box = root.querySelector<HTMLElement>(key === 'log' ? '.sim-log .sim-items' : `.sim-box[data-k="${key}"] .sim-items`)!;
    box.replaceChildren(
      ...items.map((t) => {
        const chip = document.createElement('span');
        chip.className = 'sim-chip';
        chip.textContent = t;
        if (!prev.includes(t)) chip.classList.add('new');
        return chip;
      }),
    );
  };
  const render = (prevIndex: number) => {
    const s = steps[i];
    const p = steps[prevIndex] ?? s;
    root.querySelectorAll('.sim-line').forEach((l) => l.classList.toggle('on', Number((l as HTMLElement).dataset.i) === s.line));
    fill('stack', s.stack, prevIndex === i ? [] : p.stack);
    fill('micro', s.micro, p.micro);
    fill('tasks', s.tasks, p.tasks);
    fill('raf', s.raf, p.raf);
    fill('log', s.log, p.log);
    root.querySelector('.sim-box[data-k="raf"]')!.classList.toggle('frame', !!s.frame);
    root.querySelector('.sim-note')!.textContent = s.note;
    root.querySelector('.sim-count')!.textContent = `${i + 1} / ${steps.length}`;
    (root.querySelector('[data-act="back"]') as HTMLButtonElement).disabled = i === 0;
    (root.querySelector('[data-act="next"]') as HTMLButtonElement).disabled = i === steps.length - 1;
  };
  root.querySelector('.sim-ctrl')!.addEventListener('click', (e) => {
    const act = (e.target as Element).closest<HTMLButtonElement>('button[data-act]')?.dataset.act;
    if (!act) return;
    const prev = i;
    if (act === 'next') i = Math.min(steps.length - 1, i + 1);
    if (act === 'back') i = Math.max(0, i - 1);
    if (act === 'reset') i = 0;
    render(prev);
  });
  render(0);
}

/* ---------- клик мышкой против button.click() ---------- */
function clickOrder(root: HTMLElement) {
  root.className = 'demo';
  root.innerHTML = `
    <div class="co-btns">
      <button type="button" class="demo-btn primary co-target">Нажми меня мышкой</button>
      <button type="button" class="demo-btn co-script">Вызвать button.click() из кода</button>
    </div>
    <ol class="run-out co-out"><li class="placeholder">Здесь появится порядок</li></ol>`;
  const target = root.querySelector<HTMLButtonElement>('.co-target')!;
  const out = root.querySelector<HTMLElement>('.co-out')!;
  let source = 'мышкой';
  const log = (text: string, kind: 'handler' | 'micro' | 'head') => {
    const li = document.createElement('li');
    li.className = `co-${kind}`;
    li.textContent = text;
    out.append(li);
  };
  target.addEventListener('click', () => {
    out.replaceChildren();
    log(`Нажатие ${source}:`, 'head');
    Promise.resolve().then(() => log('Микрозадача 1', 'micro'));
    log('Обработчик 1', 'handler');
  });
  target.addEventListener('click', () => {
    Promise.resolve().then(() => {
      log('Микрозадача 2', 'micro');
      source = 'мышкой';
    });
    log('Обработчик 2', 'handler');
  });
  root.querySelector('.co-script')!.addEventListener('click', () => {
    source = 'через button.click()';
    target.click();
  });
}

function frameLab(root: HTMLElement, signal: AbortSignal) {
  root.className = 'demo';
  root.innerHTML = `
    <div class="lab-top">
      <div class="seg" role="group" aria-label="Режим нагрузки">
        <button type="button" data-m="idle" aria-pressed="true">Без нагрузки</button>
        <button type="button" data-m="thrash" aria-pressed="false">Вперемешку</button>
        <button type="button" data-m="batch" aria-pressed="false">Планировщик</button>
      </div>
      <div class="meters">
        <div class="meter ok" data-k="fps"><b>60</b><span>кадров в секунду</span></div>
        <div class="meter ok" data-k="work"><b>0</b><span>мс работы в кадре</span></div>
      </div>
    </div>
    <div class="lab-tracks">
      <div class="lab-track"><span class="lab-ball js"></span><small>JavaScript, главный поток</small></div>
      <div class="lab-track"><span class="lab-ball css"></span><small>CSS, композитор</small></div>
    </div>
    <div class="lab-bars" aria-hidden="true"></div>
    <p class="lab-note">Сейчас в кадре нет лишней работы.</p>`;
  const q = <T extends Element>(s: string) => root.querySelector<T>(s)!;
  const barsBox = q<HTMLElement>('.lab-bars');
  const ball = q<HTMLElement>('.lab-ball.js');
  const tracks = q<HTMLElement>('.lab-tracks');
  const fpsEl = q<HTMLElement>('[data-k="fps"]');
  const workEl = q<HTMLElement>('[data-k="work"]');
  const note = q<HTMLElement>('.lab-note');
  const bars: HTMLElement[] = [];
  for (let i = 0; i < 420; i++) {
    const b = document.createElement('i');
    b.style.width = `${40 + (i % 90)}px`;
    barsBox.append(b);
    bars.push(b);
  }
  const NOTES: Record<string, string> = {
    idle: 'Сейчас в кадре нет лишней работы.',
    thrash: 'Каждый кадр 420 раз: прочитать ширину, записать новую. Каждое чтение после записи заставляет браузер пересчитать вёрстку.',
    batch: 'Та же работа, но сначала все 420 чтений, потом все записи. Вёрстка считается один раз за кадр.',
  };
  let mode = 'idle';
  let raf = 0;
  let last = 0;
  let frameEma = 16.7;
  let workEma = 0;
  let shown = 0;
  const next = (w: number) => (w >= 129 ? 40 : w + 1);

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    if (last) frameEma = frameEma * 0.9 + (now - last) * 0.1;
    last = now;
    const run = Math.max(60, tracks.clientWidth - 220);
    const t0 = performance.now();
    if (mode === 'thrash') {
      for (const b of bars) b.style.width = `${next(b.offsetWidth)}px`;
    } else if (mode === 'batch') {
      const widths = bars.map((b) => b.offsetWidth);
      bars.forEach((b, i) => (b.style.width = `${next(widths[i])}px`));
    }
    workEma = workEma * 0.85 + (performance.now() - t0) * 0.15;
    ball.style.transform = `translateX(${(Math.sin(now / 520) * 0.5 + 0.5) * run}px)`;
    if (now - shown > 250) {
      shown = now;
      const fps = Math.min(240, Math.round(1000 / frameEma));
      fpsEl.querySelector('b')!.textContent = String(fps);
      workEl.querySelector('b')!.textContent = workEma < 10 ? workEma.toFixed(1) : String(Math.round(workEma));
      fpsEl.className = `meter ${fps >= 55 ? 'ok' : fps >= 35 ? 'warn' : 'bad'}`;
      workEl.className = `meter ${workEma <= 4 ? 'ok' : workEma <= 12 ? 'warn' : 'bad'}`;
      root.style.setProperty('--run', `${run}px`);
    }
  }
  // крутимся, только пока демо на экране
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !raf) {
      last = 0;
      raf = requestAnimationFrame(frame);
    } else if (!e.isIntersecting && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  });
  io.observe(root);
  signal.addEventListener('abort', () => {
    io.disconnect();
    cancelAnimationFrame(raf);
  });
  q<HTMLElement>('.seg').addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-m]');
    if (!b) return;
    mode = b.dataset.m!;
    root.querySelectorAll('.seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    note.textContent = NOTES[mode];
  });
}

function eventOrder(root: HTMLElement) {
  root.className = 'demo';
  root.innerHTML = `
    <div class="run-code">
      <pre><code>console.log('обычный код');
setTimeout(() =&gt; console.log('задача: setTimeout'), 0);
requestAnimationFrame(() =&gt; console.log('перед кадром: rAF'));
Promise.resolve().then(() =&gt; console.log('микрозадача'));</code></pre>
      <button type="button" class="run-btn">▶ Запустить</button>
    </div>
    <ol class="run-out"><li class="placeholder">Здесь появится вывод</li></ol>`;
  const out = root.querySelector<HTMLElement>('.run-out')!;
  root.querySelector('.run-btn')!.addEventListener('click', () => {
    out.replaceChildren();
    const t0 = performance.now();
    const log = (text: string) => {
      const li = document.createElement('li');
      const em = document.createElement('em');
      em.textContent = `+${(performance.now() - t0).toFixed(1)} мс`;
      const span = document.createElement('span');
      span.textContent = text;
      li.append(em, span);
      out.append(li);
    };
    // тот же код, что в блоке выше
    log('обычный код');
    setTimeout(() => log('задача: setTimeout'), 0);
    requestAnimationFrame(() => log('перед кадром: rAF'));
    Promise.resolve().then(() => log('микрозадача'));
  });
}
