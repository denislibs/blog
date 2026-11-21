---
title: 'Перформанс-гайдлайн: анимации на 120 fps'
date: 2026-11-21
excerpt: 'На экране 120 Гц у кадра всего 8,3 мс. Что можно анимировать, как не вызывать лишний reflow и как проверить, что ничего не дёргается.'
tags: [perf, css, react]
---

На экране 120 Гц браузер рисует кадр за 8,3 мс. Нашему JavaScript из них достаётся 3–4 мс, остальное уходит на стили, вёрстку, отрисовку и внутреннюю работу браузера. Если код не успел, кадр пропускается, и пользователь видит рывок.

Ниже правила, по которым мы делаем анимации, чтобы они укладывались в этот бюджет. Как анимация должна выглядеть, тут не обсуждаю. Только как сделать, чтобы она не тормозила.

| Частота экрана | Время на кадр | Сколько остаётся нашему JS |
| --- | --- | --- |
| 60 Гц | 16,7 мс | до 8 мс |
| 120 Гц | 8,3 мс | 3–4 мс |

## Коротко

Если читать всё некогда, вот десять правил:

1. Анимируем только `transform` и `opacity`. Их обрабатывает композитор, вёрстку они не трогают.
2. В одном кадре сначала читаем всё из DOM, потом всё записываем. Чередовать нельзя.
3. Все изменения DOM проходят через один планировщик с фазами measure и mutate.
4. Покадровую работу делаем в `requestAnimationFrame`. `setTimeout` и `setInterval` для этого не подходят.
5. Прогресс анимации считаем по времени. Иначе на 120 Гц она поедет в два раза быстрее.
6. Пока идёт анимация, React не рендерится. Значения пишем прямо в `style` через ref или отдаём анимацию браузеру через CSS или WAAPI.
7. Тяжёлую работу уносим с главного потока: в воркеры, в OffscreenCanvas или режем на куски.
8. Рендерим только то, что видно: виртуализация, `content-visibility`, пауза для анимаций за пределами экрана.
9. Тяжёлые блоки изолируем через `contain`, чтобы пересчёт внутри них не задевал всю страницу.
10. Каждую анимацию проверяем в профайлере с замедлением CPU в 4 раза.

## Как браузер рисует кадр

Каждый кадр проходит пять этапов. Чем раньше в этой цепочке начинается работа, которую запустила анимация, тем дороже обходится кадр.

![Конвейер кадра: transform и opacity пропускают Layout и Paint](/images/frame-pipeline.svg)

Если анимировать `width`, браузер в каждом кадре заново считает вёрстку, рисует пиксели и собирает слои. С `transform` остаётся только последний шаг.

Подробнее про этапы:

- Layout, он же reflow, пересчитывает размеры и положение элементов. Это самый дорогой этап: изменение одного элемента может задеть соседей, родителя и в итоге всю страницу.
- Paint рисует пиксели слоя. Особенно дорого выходит на больших площадях, с тенями, размытием и градиентами.
- Composite собирает готовые слои на видеокарте. `transform` и `opacity` меняют только этот этап, поэтому такая анимация идёт в потоке композитора и остаётся плавной, даже когда главный поток занят.
- Принудительный reflow случается, когда JS сначала меняет стили, а потом читает геометрию (`offsetWidth`, `getBoundingClientRect`, `scrollTop`). Браузеру приходится посчитать Layout прямо посреди вашего кода. Если такое происходит в цикле, получается layout thrashing.

## Что анимировать

Любой эффект стараемся выразить через `transform` и `opacity`. Если не получается, лучше придумать анимацию по-другому.

### Чем заменить дорогие свойства

| Хочется анимировать | Что делаем |
| --- | --- |
| `top`, `left`, `margin` | `transform: translate()` |
| `width`, `height` | `transform: scale()` с обратным масштабом для детей или FLIP |
| Высоту аккордеона | `clip-path: inset()` или `transform` содержимого. `grid-template-rows: 0fr → 1fr` подходит только для небольших блоков, потому что это всё ещё Layout |
| `box-shadow`, когда карточка приподнимается | Рисуем тень на `::after` и анимируем её `opacity` |
| `background-color` на большой площади | Кладём сверху второй слой нужного цвета и анимируем его `opacity` |
| `filter: blur()`, `backdrop-filter` | Размытие оставляем статичным, анимируем `opacity` слоя с ним |
| Скролл через `scrollTop` в цикле | `scrollTo({ behavior: 'smooth' })` или `transform` на время анимации |

### Слои и will-change

Каждый слой занимает память на видеокарте. Полноэкранный слой на мониторе 2560×1440 весит около 14 МБ. Когда таких слоёв десятки, интерфейс начинает тормозить сильнее, чем без них.

Поэтому:

- `will-change: transform` ставим прямо перед анимацией и убираем после неё. Например, ставим на `pointerdown` перед перетаскиванием и снимаем на `transitionend`. Насовсем оставляем только у элементов, которые двигаются постоянно, вроде боковой панели или липкой шапки.
- `transform: translateZ(0)` на всё подряд для ускорения не пишем. Это такой же лишний слой.
- Элемент, который перекрывает слой, тоже может незаметно превратиться в слой. Это видно в DevTools на вкладке Layers.

### contain и content-visibility

- `contain: layout paint` ставим на самостоятельные блоки: карточку сообщения, строку списка, виджет. Тогда изменения внутри блока не заставляют пересчитывать страницу.
- `contain: strict` подходит, если у блока фиксированный размер, как у вьюпорта виртуального списка или у канваса.
- `content-visibility: auto` вместе с `contain-intrinsic-size` вешаем на длинные секции. Браузер не будет считать вёрстку и рисовать то, что за пределами экрана.

```css
.message { contain: layout paint; }
.history-section {
  content-visibility: auto;
  contain-intrinsic-size: auto 600px;
}
```

## Как не вызывать лишний reflow

Чаще всего сложный интерфейс дёргается из-за того, что код читает и пишет DOM вперемешку. Мы решаем это так: все операции с DOM идут через один планировщик. В каждом кадре он сначала выполняет все чтения, потом все записи. Браузер считает Layout один раз за кадр, а не на каждой итерации цикла.

### Как это сделано в Telegram Web A

В открытом репозитории Telegram Web A ([telegram-tt](https://github.com/Ajaxy/telegram-tt/tree/master/src/lib/fasterdom)) за это отвечает модуль `fasterdom`. Вот что в нём есть (я смотрел ветку master 21 ноября 2026):

| Функция | Что делает |
| --- | --- |
| `requestMeasure(cb)` | Ставит чтение геометрии в очередь фазы measure |
| `requestMutation(cb)` | Ставит изменение DOM в очередь фазы mutate |
| `requestNextMutation(cb)` | Мутация, запрошенная изнутри measure. По сути это `requestMeasure(() => requestMutation(cb))` |
| `requestForcedReflow(cb)` | Для чтения, которое нужно сделать уже после мутаций. Выполняется после фазы mutate. Если колбэк вернёт функцию, она применится как ещё одна мутация |

Все очереди разбираются в одном `requestAnimationFrame`. Сначала выполняются все measure, затем в микрозадаче все mutate, потом forced reflow и мутации, которые из них вернулись.

Рядом лежит `stricterdom`. После вызова `enableStrict()` он подменяет свойства и методы, которые вызывают Layout, и следит за DOM через `MutationObserver`. Если прочитать геометрию вне фазы measure, вылетит ошибка «Unexpected measurement detected». Если изменить DOM вне фазы mutate, будет «Unexpected mutation detected».

Код telegram-tt выложен под копилефт-лицензией, поэтому мы его не копируем. Свой планировщик написали по той же идее. Если не хочется писать своё, есть библиотека [FastDOM](https://github.com/wilsonpage/fastdom) под MIT, она устроена так же.

### Наш планировщик

```ts
// dom-scheduler.ts
type Task = () => void;
type Phase = 'idle' | 'measure' | 'mutate';

let measures: Task[] = [];
let mutations: Task[] = [];
let scheduled = false;
let phase: Phase = 'idle';

const run = (task: Task) => {
  try { task(); } catch (e) { console.error(e); }
};

function flush() {
  scheduled = false;

  phase = 'measure';
  const reads = measures; measures = [];
  reads.forEach(run);        // мутации, запрошенные здесь, попадут в этот же кадр

  phase = 'mutate';
  const writes = mutations; mutations = [];
  writes.forEach(run);       // чтения, запрошенные здесь, уйдут в следующий кадр

  phase = 'idle';
  if (measures.length || mutations.length) schedule();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flush);
}

export const getPhase = () => phase;
export function requestMeasure(task: Task) { measures.push(task); schedule(); }
export function requestMutation(task: Task) { mutations.push(task); schedule(); }
```

### Как им пользоваться

```ts
// Плохо: чтение и запись вперемешку, reflow на каждой итерации
items.forEach((el) => {
  const h = el.offsetHeight;            // чтение
  el.style.height = `${h + 10}px`;      // запись, и следующее чтение снова пересчитает Layout
});

// Хорошо: сначала все чтения, потом все записи, один Layout за кадр
requestMeasure(() => {
  const heights = items.map((el) => el.offsetHeight);
  requestMutation(() => {
    items.forEach((el, i) => {
      el.style.transform = `translateY(${heights[i]}px)`;
    });
  });
});
```

О чём мы договорились в команде:

- Геометрию (`offset*`, `client*`, `scroll*`, `getBoundingClientRect`, `getComputedStyle`) читаем только внутри `requestMeasure`.
- `style`, классы, вставку и удаление узлов вне React меняем только внутри `requestMutation`.
- Размеры, которые меняются редко, кешируем и обновляем через `ResizeObserver`. Читать их заново каждый кадр не нужно.
- Видимость элемента узнаём через `IntersectionObserver`. Вызывать `getBoundingClientRect` на каждый скролл не надо.

### Строгий режим в разработке

Мы повторили идею stricterdom: в dev-сборке оборачиваем геттеры геометрии и пишем предупреждение, если их читают вне фазы measure. В продакшен этот код не попадает.

```ts
import { getPhase } from './dom-scheduler';

if (import.meta.env.DEV) {
  const LAYOUT_GETTERS: [object, string][] = [
    [HTMLElement.prototype, 'offsetWidth'], [HTMLElement.prototype, 'offsetHeight'],
    [HTMLElement.prototype, 'offsetTop'], [HTMLElement.prototype, 'offsetLeft'],
    [Element.prototype, 'clientWidth'], [Element.prototype, 'clientHeight'],
    [Element.prototype, 'scrollTop'], [Element.prototype, 'scrollHeight'],
  ];
  for (const [proto, key] of LAYOUT_GETTERS) {
    const desc = Object.getOwnPropertyDescriptor(proto, key);
    if (!desc?.get) continue;
    const get = desc.get;
    Object.defineProperty(proto, key, {
      ...desc,
      get() {
        if (getPhase() !== 'measure') console.warn(`Чтение ${key} вне фазы measure, возможен reflow`);
        return get.call(this);
      },
    });
  }
}
```

Методы `getBoundingClientRect` и `getComputedStyle` оборачиваем так же. Первое время предупреждений будет много. Каждое из них показывает место, которое надо перевести на планировщик.

## Цикл анимации

Чем меньше анимация зависит от главного потока, тем она плавнее. Из таблицы берём самый верхний способ, который подходит под задачу.

| Способ | Где выполняется | Когда подходит |
| --- | --- | --- |
| CSS transition или animation на `transform` и `opacity` | В потоке композитора, занятость JS на неё не влияет | Любая смена состояния: открытие, наведение, появление |
| Web Animations API (`el.animate`) | Для `transform` и `opacity` тоже на композиторе | Когда значения считаются в JS: FLIP, цепочки анимаций, отмена и разворот |
| `requestAnimationFrame` с записью в `style` | На главном потоке, каждый кадр | Движение за пальцем, физика, пружины от скорости жеста |
| Canvas или WebGL в воркере через OffscreenCanvas | В отдельном потоке | Сложные иллюстрации, анимированные стикеры, частицы |

### Считаем по времени

На 120 Гц `requestAnimationFrame` вызывается в два раза чаще, чем на 60 Гц. Если написать `x += 5`, на быстром экране элемент поедет вдвое быстрее, а при пропущенном кадре дёрнется. Поэтому прогресс считаем от прошедшего времени.

```ts
export function animate(
  duration: number,
  onFrame: (progress: number) => void,
  ease: (t: number) => number = (t) => 1 - Math.pow(1 - t, 3),
) {
  let start: number | undefined;
  let id = 0;
  const tick = (now: number) => {
    start ??= now;
    const t = Math.min((now - start) / duration, 1);
    onFrame(ease(t));                 // здесь только запись transform и opacity
    if (t < 1) id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id); // анимацию всегда можно остановить
}
```

### Правила для цикла

- На всё приложение один цикл rAF. Если у десяти компонентов свои циклы, получается десять чтений и записей вразнобой. Покадровую работу пускаем через планировщик из прошлого раздела.
- Внутри кадра только пишем. Всё, что нужно измерить, измеряем один раз перед стартом.
- Значения пишем в CSS-переменную или прямо в `style.transform`. Переключать классы каждый кадр не стоит. Переменную ставим на сам анимируемый элемент: если поставить её на корень, браузер пересчитает стили всего дерева.
- Если анимацию не видно, ставим её на паузу. Бесконечные анимации останавливаем через `IntersectionObserver` и событие `visibilitychange`.
- Анимацию и тяжёлую работу разводим по времени. Когда открывается панель, сначала едет лёгкий каркас, а тяжёлое содержимое монтируется на `transitionend` или когда браузер освободится.

## Отзывчивость ввода

Даже самая плавная анимация не спасёт, если клик обрабатывается 300 мс. Мы стараемся, чтобы после любого действия следующий кадр появлялся быстрее чем через 100 мс. INP до 200 мс считаем нижней планкой.

### Обработчики событий

- Сначала показываем реакцию, потом работаем. Обработчик меняет состояние кнопки и сразу отпускает поток, а тяжёлая логика выполняется после следующей отрисовки.
- Слушатели скролла и тача вешаем с `{ passive: true }`. Иначе браузер будет ждать наш JS, прежде чем прокрутить страницу.
- Частые события (`pointermove`, `scroll`, `resize`) привязываем к кадру: запоминаем последнее значение и обрабатываем его один раз в rAF. `debounce` на таймере для этого не годится, с ним движение рвётся.
- Перетаскивание делаем через Pointer Events и `setPointerCapture`, а на перетаскиваемый элемент ставим `touch-action: none`.

```ts
let lastX = 0;
let pending = false;

el.addEventListener('pointermove', (e) => {
  lastX = e.clientX;
  if (pending) return;
  pending = true;
  requestMutation(() => {
    pending = false;
    el.style.transform = `translateX(${lastX - startX}px)`;
  });
}, { passive: true });
```

### Длинные задачи

Задача дольше 50 мс блокирует на главном потоке и ввод, и анимации. На 120 Гц кадр теряется уже на задаче в 10 мс.

- Большую работу режем на куски и между ними отдаём поток. Где поддерживается `scheduler.yield()`, используем его, в остальных браузерах `setTimeout(0)` или `MessageChannel`.
- Несрочное откладываем в `requestIdleCallback`: аналитику, предзагрузку, прогрев кешей.
- Тяжёлое уносим в Web Worker: разбор больших ответов, поиск и сортировку длинных списков, работу с файлами и картинками, рисование на OffscreenCanvas.
- Картинки декодируем заранее: вызываем `img.decode()` перед показом и ставим `decoding="async"` на все `<img>`. Иначе большая картинка начнёт декодироваться прямо посреди анимации.

## Большие списки и тяжёлый DOM

Чем больше DOM, тем дольше считаются Layout и стили. Мы держимся такого ориентира: не больше 1 500 узлов на экране и не глубже 32 уровней вложенности.

| Сколько элементов | Что делаем |
| --- | --- |
| До 100 | Рендерим как обычно, на строку ставим `contain: layout paint` |
| От 100 до 1 000 | `content-visibility: auto` на строках или группах строк |
| Больше 1 000 или бесконечная подгрузка | Виртуализация: в DOM только видимые строки и запас в один экран сверху и снизу |

### Правила для списков

- Высота строк должна быть стабильной. Если она фиксированная или известна заранее, позиции считаются без измерений. Если строки разной высоты, измеряем их через `ResizeObserver` и кешируем.
- Скролл оставляем нативным. `wheel` не перехватываем и не скроллим через JS. Позицию строк задаём через `transform: translateY()`.
- Когда подгружаем данные сверху (история чата, лента), держим позицию. Перед вставкой запоминаем `scrollHeight` в фазе measure, после вставки в том же кадре сдвигаем `scrollTop` на разницу. Где поддерживается `overflow-anchor`, браузер делает это сам.
- На строках длинного списка не используем тяжёлые эффекты. `box-shadow`, `filter`, `backdrop-filter` и сложные градиенты на сотнях строк делают скролл дорогим.

### FLIP

FLIP (First, Last, Invert, Play) анимирует перемещение и изменение размера через `transform`. Layout при этом считается один раз перед анимацией, в самих кадрах его нет.

```ts
// 1. First: запоминаем старые позиции видимых элементов
const first = new Map(rows.map((el) => [el, el.getBoundingClientRect().top]));

// 2. Last: применяем изменение DOM (пересортировка, вставка)
applyNewOrder();

// 3. Invert и Play: одно чтение, дальше только transform на композиторе
requestMeasure(() => {
  const deltas = rows.map((el) => first.get(el)! - el.getBoundingClientRect().top);
  requestMutation(() => {
    rows.forEach((el, i) => {
      if (!deltas[i]) return;
      el.animate(
        [{ transform: `translateY(${deltas[i]}px)` }, { transform: 'none' }],
        { duration: 250, easing: 'cubic-bezier(.2, 0, 0, 1)' },
      );
    });
  });
});
```

FLIP применяем только к видимым элементам и не больше чем к 50 за раз. Для переходов между экранами есть View Transitions API, он делает то же самое: снимает старое и новое состояние и анимирует снимки на композиторе. Переходы между страницами в этом блоге сделаны как раз на нём.

## React без лишних рендеров

Рендер React выполняется на главном потоке. Если анимация идёт через `setState` каждый кадр, все 3–4 мс уходят на сравнение дерева, и на само движение ничего не остаётся.

- В кадре `setState` не вызываем. То, что меняется каждый кадр (позиция при перетаскивании, прогресс), храним в `useRef` и пишем прямо в `ref.current.style`.
- Состояние меняем только в начале и в конце: открыли и закрыли, начали и закончили тащить. Всё, что между ними, делает CSS.
- Измеряем в `useLayoutEffect` через планировщик. В теле рендера ничего не меряем и не смешиваем чтение с записью.
- Анимируемые компоненты изолируем: `memo`, стабильные пропсы, селекторы вместо подписки на весь стор. Открытие меню не должно перерисовывать список из 500 строк.
- Тяжёлый рендер оборачиваем в `startTransition`, чтобы он не мешал вводу и текущей анимации. Содержимое панели монтируем, когда она уже доехала.
- Проверяем в React Profiler: пока идёт анимация, коммитов быть не должно, кроме первого и последнего.

```tsx
function DraggableCard() {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef(0);
  const [dragging, setDragging] = useState(false); // меняется дважды за перетаскивание

  const onPointerMove = (e: React.PointerEvent) => {
    const x = e.clientX - start.current;
    requestMutation(() => {
      ref.current!.style.transform = `translateX(${x}px)`; // без рендера React
    });
  };

  return (
    <div
      ref={ref}
      className={dragging ? 'card is-dragging' : 'card'}
      onPointerDown={(e) => { start.current = e.clientX; setDragging(true); e.currentTarget.setPointerCapture(e.pointerId); }}
      onPointerMove={dragging ? onPointerMove : undefined}
      onPointerUp={() => setDragging(false)}
    />
  );
}
```

## Как измерять

Каждую новую анимацию профилируем ещё до ревью. На мощном ноутбуке разработчика всё выглядит плавно, поэтому проверяем с замедлением.

### Chrome DevTools

| Инструмент | Что смотрим |
| --- | --- |
| Performance с замедлением CPU ×4 | Кадры дольше бюджета, блоки Layout и Recalculate Style во время анимации, предупреждения «Forced reflow» |
| Rendering → Paint flashing | Что перерисовывается. Пока идёт transform-анимация, зелёных вспышек быть не должно |
| Rendering → Layer borders и панель Layers | Лишние слои и сколько памяти они занимают |
| Rendering → Frame rendering stats | FPS и пропущенные кадры в реальном времени |
| Animations | Замедляем анимацию до 10 % и смотрим кривые и тайминги |
| React Profiler | Лишние коммиты во время анимации |

### Метрики с реальных пользователей

- INP (Interaction to Next Paint): цель до 200 мс на 75-м перцентиле.
- Long Animation Frames: `PerformanceObserver` с типом `long-animation-frame` показывает кадры дольше 50 мс и скрипты, которые в них виноваты.
- CLS: цель до 0,1. Анимации не должны сдвигать вёрстку.

```ts
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 50) reportLongFrame(entry); // отправляем в аналитику вместе со списком скриптов
  }
}).observe({ type: 'long-animation-frame', buffered: true });
```

### Пороги для ревью

| Метрика | Порог |
| --- | --- |
| JS в кадре анимации (CPU ×4) | до 4 мс |
| Layout во время transform-анимации | 0 |
| Принудительные reflow в профиле | 0 |
| Длинные задачи во время анимации | 0 |
| Пропущенные кадры на 120 Гц без замедления | не больше 1 за анимацию |
| INP, 75-й перцентиль | до 200 мс |

## Чего не делать

| Так не делаем | Делаем так |
| --- | --- |
| Читаем `offsetHeight` после записи стиля в цикле | Все чтения в `requestMeasure`, все записи в `requestMutation` |
| Вызываем `getBoundingClientRect` в обработчике `scroll` | `IntersectionObserver` или кеш через `ResizeObserver` |
| Анимируем `width`, `height`, `top`, `left` | `transform` или FLIP |
| Вызываем `setState` в каждом кадре анимации | Пишем в `ref.current.style` или отдаём анимацию CSS и WAAPI |
| Крутим анимацию через `setInterval(fn, 16)` | `requestAnimationFrame` и прогресс по времени |
| Заводим свой цикл rAF в каждом компоненте | Один планировщик на приложение |
| Ставим `will-change` и `translateZ(0)` на всё подряд | Слой только на время анимации |
| Анимируем `box-shadow`, `filter`, `backdrop-filter` или вешаем их на каждую строку списка | Анимируем `opacity` слоя с готовым эффектом |
| Запускаем тяжёлый рендер в том же кадре, что и анимацию | Каркас сразу, содержимое после `transitionend` или в `startTransition` |
| Оставляем бесконечные анимации крутиться за экраном | Пауза по `IntersectionObserver` и `visibilitychange` |
| Скроллим через JS и перехватываем `wheel` | Нативный скролл и `passive`-слушатели |
| Держим в DOM тысячи строк | Виртуализация и `content-visibility` |

## Чек-лист для ревью

В коде:

- [ ] Анимируются только `transform` и `opacity`
- [ ] Чтения геометрии и записи в DOM идут через планировщик, строгий режим не ругается
- [ ] Нет `setState` в каждом кадре, в React Profiler во время анимации пусто
- [ ] Прогресс считается по времени, анимацию можно отменить
- [ ] `will-change` ставится и снимается, лишних слоёв нет

В профиле с замедлением CPU ×4:

- [ ] Во время transform-анимации нет Layout и Paint
- [ ] Нет предупреждений «Forced reflow»
- [ ] JS в кадре укладывается в 4 мс, длинных задач нет
- [ ] Paint flashing во время анимации ничего не подсвечивает

На реальном устройстве:

- [ ] На экране 120 Гц нет заметных рывков, скорость такая же, как на 60 Гц
- [ ] На слабом ноутбуке или среднем телефоне анимация остаётся плавной
- [ ] Клик и ввод посреди анимации срабатывают сразу

## Источники

- [telegram-tt, каталог src/lib/fasterdom](https://github.com/Ajaxy/telegram-tt/tree/master/src/lib/fasterdom): из чего состоит модуль (fasterdom.ts, stricterdom.ts, layoutCauses.ts)
- [fasterdom.ts](https://raw.githubusercontent.com/Ajaxy/telegram-tt/master/src/lib/fasterdom/fasterdom.ts): `requestMeasure`, `requestMutation`, `requestNextMutation`, `requestForcedReflow`
- [stricterdom.ts](https://raw.githubusercontent.com/Ajaxy/telegram-tt/master/src/lib/fasterdom/stricterdom.ts): `enableStrict`, `disableStrict`, `forceMeasure`, `forceMutation`, `setHandler`
- [FastDOM](https://github.com/wilsonpage/fastdom): библиотека с тем же подходом, лицензия MIT

Исходники telegram-tt я смотрел 21 ноября 2026. Остальные цифры (бюджеты кадра, пороги INP и CLS, 50 мс для длинных задач) взяты из общепринятых рекомендаций Chrome и web.dev, по конкретным страницам я их в этот раз не сверял. Лицензию telegram-tt (насколько я знаю, это GPL-3.0) лучше проверить в репозитории, прежде чем что-то оттуда брать.
