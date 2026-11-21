---
title: 'Кто ждёт кадра: как рендерят React, Vue, Flutter, SwiftUI и Compose'
date: 2026-11-21
excerpt: 'Веб-фреймворки меняют интерфейс сразу, а Flutter, SwiftUI и Jetpack Compose ждут сигнала экрана. Разбираемся, как это устроено внутри и что из этого следует для нас.'
tags: [perf, react, flutter, swiftui]
---

Привет, друзья!

В [прошлой статье про анимации на 120 fps](/posts/perf-120fps/) мы долго боролись с принудительным reflow и в итоге пришли к простой идее: все чтения и записи DOM надо выполнять по расписанию, в такт кадрам экрана. Так делает Teact в Telegram Web A, и так же можно настроить Preact.

После этого мне стало интересно, а как с этим у остальных? Почему React и Vue так не делают? И как устроены UI-фреймворки за пределами браузера: Flutter, SwiftUI, Jetpack Compose? Я полез в документацию и исходники, и картина получилась очень показательной. Веб-фреймворки почти все применяют изменения сразу, как только могут. А нативные давно договорились, что вся работа идёт строго по сигналу экрана.

Пойдём по порядку:

1. Договоримся о словах и вспомним, как кадр рисует браузер.
2. Разберём, когда рендерят React, Vue, Svelte, Solid и Angular.
3. Посмотрим, как это устроено во Flutter, у Apple в UIKit и SwiftUI и в Android с Jetpack Compose.
4. Сравним всех на одной схеме и в таблице и решим, что из этого взять себе.

## Сначала о словах

Чтобы дальше не спотыкаться, несколько терминов.

Кадр. Это одна картинка на экране. Экран 60 Гц показывает 60 кадров в секунду, на каждый уходит 16,7 мс. Экран 120 Гц показывает вдвое больше, и на кадр остаётся 8,3 мс.

Vsync, вертикальная синхронизация. Так называют сигнал от экрана: «я готов показать следующий кадр». Он приходит ровно 60 или 120 раз в секунду, и вокруг него строится вся графика в операционной системе.

Рендер. У фреймворков это не рисование пикселей, а момент, когда фреймворк вызывает ваши компоненты, выясняет, что поменялось, и применяет изменения к интерфейсу: к DOM в браузере или к своему дереву элементов в нативе. Пиксели потом рисует браузер или система.

«Пометить грязным» (dirty). Это значит записать, что элемент устарел и его надо пересчитать, но сам пересчёт пока не делать. Это дешёвая операция, и к ней мы будем возвращаться постоянно.

Задача и микрозадача. Это два вида очередей в JavaScript. Задачей (task) будет, например, обработчик клика или колбэк `setTimeout`. Микрозадача выполняется сразу после текущего кода, ещё до того, как браузер возьмётся за следующую задачу или за отрисовку. Микрозадачу ставят через `Promise.then` или `queueMicrotask`.

Если коротко, вся статья про выбор между двумя стратегиями. Можно применить изменения как можно скорее и надеяться, что к кадру всё сойдётся. А можно только пометить изменения и сделать всю работу разом, когда придёт vsync.

## Как кадр рисует браузер

Начнём с того, на чём стоит любой веб-фреймворк. Браузер живёт в цикле событий (event loop), и спецификация HTML описывает его довольно чётко:

1. Браузер берёт из очереди одну задачу, например обработчик клика, и выполняет её.
2. Сразу после неё выполняет все накопившиеся микрозадачи.
3. Если подошло время нового кадра, браузер обновляет отрисовку. Спецификация называет это возможностью отрисовки (rendering opportunity): при экране 60 Гц она бывает не чаще раза в 1/60 секунды. Внутри этого шага сначала выполняются колбэки `requestAnimationFrame`, потом пересчитываются стили и вёрстка, и только потом рисуются пиксели.

Получается, что сам браузер работает как раз по второй стратегии: изменения DOM копятся и применяются в момент отрисовки, раз за кадр. Но есть важная оговорка, которую мы подробно разбирали в прошлой статье. DOM отвечает на вопросы синхронно. Если код спросит у элемента `offsetHeight`, браузер обязан ответить прямо сейчас, а для этого ему придётся пересчитать вёрстку посреди кадра. Это и есть принудительный reflow.

Запомним эту особенность, она объясняет почти все различия, которые мы увидим дальше. Теперь посмотрим, что поверх этого цикла делают фреймворки.

## Веб-фреймворки: применить как можно скорее

Общая идея у React, Vue, Svelte и Solid одна: изменения состояния собираются в пачку и применяются к DOM до того, как браузер нарисует кадр. Обычно это происходит в микрозадаче, то есть сразу после текущего кода. К самим кадрам экрана никто из них не привязан. Разница в деталях.

### React

React не рендерит на каждый вызов `setState`. Как сказано в документации, он ждёт, пока выполнится весь код обработчика события, и только потом обрабатывает обновления состояния. С React 18 такая группировка, её называют батчингом, работает везде: в обработчиках, таймерах, промисах.

Дальше всё зависит от срочности обновления. Внутри React у каждого обновления есть приоритет, он называется lane, то есть «полоса». Клик считается дискретным событием и получает самую срочную полосу, `SyncLane`. В исходниках видно, что такая работа выполняется в конце микрозадачи. Значит, после клика React успевает отрендерить компоненты и обновить DOM ещё до того, как браузер нарисует кадр.

Несрочную работу, например обновления внутри `startTransition`, React отдаёт своему планировщику. Тот ставит задачи через `MessageChannel`: это способ запустить код в следующей задаче без минимальной задержки в 4 мс, которая есть у `setTimeout`. Планировщик работает кусками и примерно каждые 5 мс отдаёт управление браузеру (в коде это константа `frameYieldMs = 5`), чтобы тот успел обработать ввод и нарисовать кадр.

`requestAnimationFrame` в планировщике React нет совсем. React следит за тем, чтобы не занимать поток надолго, но в какой момент кадра случится рендер, он не знает и не выбирает.

### Vue

Vue тоже копит изменения. Документация прямо говорит, что обновления DOM применяются не синхронно: Vue буферизует их до «следующего тика». В исходнике планировщика этот тик сделан через уже разрешённый промис: `resolvedPromise.then(flushJobs)`. Это та же микрозадача. Функция `nextTick` возвращает тот же промис, поэтому `await nextTick()` даёт подождать, пока DOM обновится.

Для наблюдателей (watchers) во Vue можно выбрать момент запуска. `flush: 'pre'` работает по умолчанию и запускает колбэк до обновления DOM компонента. `flush: 'post'` запускает его после обновления DOM, и это правильное место, чтобы что-то измерить. `flush: 'sync'` срабатывает сразу при изменении, без всякой группировки.

### Svelte 5

Svelte компилирует компоненты в код, который меняет DOM напрямую, без виртуального DOM. Документация к `$effect` говорит, что эффекты выполняются в микрозадаче после изменения состояния, и в исходниках очередь действительно разбирается через `queueMicrotask`. Если нужно применить изменения прямо сейчас, есть `flushSync`, а дождаться их помогает `tick()`.

### Solid

Solid тоже работает без виртуального DOM: каждый сигнал знает, какие места в DOM от него зависят, и обновляет только их. В версии 1.x это происходило синхронно, прямо в момент записи в сигнал, а для группировки был `batch`. В Solid 2.0 подход поменяли. README новой реактивной библиотеки говорит, что обновления группируются и применяются асинхронно через микрозадачу, и прочитать новое значение сразу после записи нельзя, пока не выполнится `flush()`. `batch` в 2.0 больше нет.

### Angular: исключение

Angular долго полагался на библиотеку zone.js. Она перехватывает все асинхронные операции, и Angular запускает проверку изменений, когда задача и все её микрозадачи закончились.

С версии 21 Angular по умолчанию работает без zone.js. Изменения сигналов, вызовы `markForCheck` и события из шаблонов только уведомляют планировщик. А вот как планировщик выбирает момент, уже интересно: он устраивает гонку между `setTimeout` и `requestAnimationFrame`. Что сработает первым, то и запускает проверку изменений, а второе отменяется. Почему не просто `requestAnimationFrame`, объясняет комментарий в коде: в фоновых вкладках он не вызывается.

Получается, что из популярных веб-фреймворков Angular ближе всех к рендеру по кадрам. Но и он не делит работу на чтения и записи, как это делает fasterdom в Teact.

Итак, в вебе фреймворк меняет DOM, а браузер рисует кадр позже и сам. Между ними никто не следит, чтобы код не читал размеры после записи. Теперь посмотрим, как устроен мир, где этого разрыва нет.

## Flutter: всё по сигналу экрана

Flutter рисует интерфейс сам, без браузера и без системных элементов интерфейса, поэтому и цикл кадра у него свой. И устроен он ровно по второй стратегии.

Когда вы вызываете `setState`, Flutter выполняет ваш колбэк синхронно, а потом вызывает `markNeedsBuild`. По документации этот метод помечает элемент грязным и добавляет его в список виджетов, которые надо перестроить в следующем кадре. Сам build при этом не происходит. Если кадр ещё не запланирован, Flutter просит систему его запланировать, и кадр начнётся по сигналу vsync от операционной системы.

Внутри кадра работа идёт строго по фазам. Их можно увидеть прямо в перечислении `SchedulerPhase`:

1. Колбэки анимаций. Здесь `Ticker` двигает все анимации ровно один раз за кадр.
2. Микрозадачи, которые эти колбэки успели поставить.
3. Основной конвейер: build всех грязных виджетов, потом layout, paint и сборка слоёв. Документация к `WidgetsBinding.drawFrame` перечисляет эти этапы по порядку.
4. Колбэки после кадра, которые добавляют через `addPostFrameCallback`.

Изменения вёрстки и отрисовки тоже не применяются сразу. `markNeedsLayout` и `markNeedsPaint` только помечают объект и планируют обновление, а документация к `markNeedsPaint` отдельно подчёркивает, что несколько изменений подряд сливаются в одну отрисовку.

Самое интересное начинается, если попробовать сделать то, что в вебе вызывает reflow. Во Flutter прочитать размер элемента вне фазы layout просто нельзя: в отладочной сборке это падает с ошибкой «RenderBox.size accessed beyond the scope of resize, layout, or permitted parent access». Вместо этого есть два честных пути. `LayoutBuilder` получает ограничения размера прямо во время layout. А `addPostFrameCallback` позволяет посмотреть на результат после того, как кадр собран. Если же поменять состояние посреди layout, Flutter предупреждает, что интерфейс будет отставать на кадр.

Есть и ещё одно отличие от браузера. Готовое дерево слоёв Flutter отдаёт в отдельный поток растеризации, где библиотеки Skia или Impeller превращают его в пиксели. Пока там рисуется один кадр, основной поток уже может готовить следующий. Бюджет документация Flutter называет прямо: около 16 мс на кадр при 60 fps и меньше 8 мс в сумме на устройствах с 120 fps.

## Apple: UIKit, Core Animation и SwiftUI

У Apple тот же принцип, только он появился гораздо раньше Flutter.

### UIKit

В UIKit есть цикл обновления (update cycle), и большинство методов для изменения интерфейса работают через него. `setNeedsLayout` по документации помечает вёрстку устаревшей и запускает её пересчёт в следующем цикле обновления, а сам метод сразу возвращает управление. Apple прямо объясняет, зачем так: можно пометить несколько представлений, прежде чем любое из них обновится. С `setNeedsDisplay` то же самое: представление перерисуется только в следующем цикле отрисовки.

А теперь самое знакомое. Метод `layoutIfNeeded` заставляет представление обновить вёрстку немедленно. Это ровно тот же принудительный reflow, что и в браузере, только в UIKit его нельзя вызвать случайно, прочитав какое-нибудь свойство. Его вызывают явно, когда действительно нужно.

### Core Animation и цикл отрисовки

Под UIKit работает Core Animation. Все изменения слоёв собираются в транзакцию, и неявная транзакция фиксируется, когда цикл обработки событий потока (run loop) переходит на следующий оборот.

Дальше, как объясняет доклад Apple «Explore UI animation hitches and the render loop», начинается цикл отрисовки (render loop). Он состоит из нескольких фаз:

1. В фазе commit приложение обновляет интерфейс и отправляет изменённое дерево слоёв отдельному процессу, серверу отрисовки (render server).
2. По следующему vsync сервер отрисовки готовит кадр к рисованию.
3. Видеокарта рисует кадр, чтобы на следующем vsync его можно было показать.

У каждой фазы есть дедлайн, и этим дедлайном служит следующий vsync. Если кадр появился на экране позже, чем должен был, Apple называет это хитчем (hitch), то есть рывком. Синхронизировать свой код с экраном можно через `CADisplayLink`, таймер, который срабатывает в такт обновлению экрана. На iPhone с ProMotion частота меняется от 10 до 120 Гц.

### SwiftUI

SwiftUI работает поверх того же механизма, и Apple на WWDC25 рассказала, как он обрабатывает изменения состояния. Когда вы меняете состояние, SwiftUI не обновляет представления сразу. Он создаёт транзакцию, то есть набор изменений иерархии представлений, которые надо применить до следующего кадра. Пометить представления устаревшими быстро, и в этот момент больше ничего не происходит. А в каждом кадре SwiftUI обрабатывает события и вычисляет `body` у всех изменившихся представлений, всё до дедлайна кадра.

## Android: Choreographer и Jetpack Compose

В Android центральная фигура называется `Choreographer`, и название говорит само за себя. По документации он координирует анимации, ввод и отрисовку: получает от системы импульсы синхронизации, тот самый vsync, и планирует работу на следующий кадр.

Обычные View подчиняются ему же. `invalidate()` обещает, что `onDraw` будет вызван когда-нибудь в будущем, а `requestLayout()` планирует проход вёрстки по дереву. Страница Android про медленную отрисовку описывает это прямо: сеттер вызывает `invalidate()`, а `draw` случится в следующем кадре.

Jetpack Compose, современный декларативный UI для Android, устроен так же. У него три фазы: composition решает, что показать, layout решает, где это разместить, drawing рисует. Документация говорит, что концептуально эти фазы проходят в каждом кадре. Когда меняется состояние, Compose планирует повторную композицию на следующий кадр. В исходниках видно, как именно: планировщик перекомпозиции (`Recomposer`) ждёт кадра через часы кадров, а на Android эти часы подписываются на `Choreographer.postFrameCallback`.

Бюджет Android называет в тех же цифрах: 16 мс при 60 fps, 11 мс при 90 fps и 8 мс при 120 fps. И добавляет неприятную подробность: если опоздать хотя бы на миллисекунду, `Choreographer` пропускает кадр целиком.

## Сравним

Теперь положим оба подхода рядом.

![Веб-фреймворк меняет DOM сразу после setState, нативный тулкит ждёт сигнала экрана](/images/render-timing.svg)

| Фреймворк | Когда применяет изменения | Привязан к кадру | Можно ли случайно сломать кадр чтением размеров |
| --- | --- | --- | --- |
| React | Клик: в микрозадаче. Несрочное: задачами через `MessageChannel`, с паузой каждые 5 мс | Нет | Да, любое чтение после коммита |
| Vue | В микрозадаче, «следующий тик» | Нет | Да |
| Svelte 5 | В микрозадаче | Нет | Да |
| Solid 2 | В микрозадаче | Нет | Да |
| Angular без zone.js | Что раньше: `requestAnimationFrame` или `setTimeout` | Почти | Да |
| Teact | В фазе mutate внутри `requestAnimationFrame` | Да | Только явно, через `requestForcedReflow` |
| Flutter | В следующем кадре по vsync | Да | Нет, размер вне layout читать нельзя |
| UIKit | В следующем цикле обновления | Да | Только явно, через `layoutIfNeeded` |
| SwiftUI | Транзакцией до следующего кадра | Да | Нет простого способа прочитать размер вне раскладки |
| Jetpack Compose | В следующем кадре через `Choreographer` | Да | Нет, размеры приходят на этапе layout |

## Почему веб устроен иначе

Различие не в том, что авторы веб-фреймворков не подумали о кадрах. Причин несколько, и они довольно глубокие.

Первая причина в синхронном DOM. Любой код на странице может в любой момент спросить у элемента его размер, и браузер обязан ответить точно. Нативные тулкиты проектировали иначе: во Flutter такое чтение запрещено, в UIKit его делают явно отдельным методом. Веб-фреймворк не может запретить вам читать DOM, это просто API браузера.

Вторая причина в том, что кадром владеет браузер. Фреймворк в вебе всего лишь библиотека поверх него. Применить изменения в микрозадаче для фреймворка проще и надёжнее: браузер всё равно соберёт их и нарисует в своём кадре, а состояние DOM к этому моменту уже будет согласованным. С `requestAnimationFrame` появляются свои сложности, и Angular честно о них пишет: в фоновых вкладках он не срабатывает.

Третья причина в том, что применять изменения сразу не так уж плохо. Запись в DOM сама по себе дешёвая, браузер всё равно отложит пересчёт до кадра. Проблема возникает, только когда чтения и записи перемешиваются, а это зависит уже от нашего кода, а не от фреймворка.

У рендера по кадрам тоже есть цена. Между изменением состояния и экраном проходит до одного кадра. А тестам приходится прокручивать кадры вручную: во Flutter для этого есть `tester.pump()`.

## Что взять себе

Если вы пишете на вебе и хотите, чтобы интерфейс жил по кадрам, как в нативе, вот что можно сделать:

- Разделить чтения и записи DOM через планировщик с фазами measure и mutate, как в прошлой статье. Это и есть веб-аналог того, что Flutter и UIKit делают из коробки.
- Обращаться с чтением размеров так же осторожно, как iOS-разработчики обращаются с `layoutIfNeeded`: только явно и только когда без него не обойтись.
- В Preact перенести рендер в нужную фазу кадра через `options.debounceRendering` и `options.requestAnimationFrame`. В React такого публичного API нет.
- Для измерений после рендера выбирать момент, когда вёрстка уже посчитана: `flush: 'post'` во Vue, `tick()` в Svelte, `useEffect` с планировщиком в React.

## Подведём итоги

- Веб-фреймворки применяют изменения сразу после вашего кода, почти всегда в микрозадаче. Кадр рисует браузер, и фреймворк в это не вмешивается. Исключение составляет Angular без zone.js, который ждёт `requestAnimationFrame` или `setTimeout`.
- Flutter, UIKit, SwiftUI и Jetpack Compose только помечают изменения, а всю работу делают в начале кадра по сигналу vsync, и каждый этап выполняется один раз.
- Главное отличие не в фреймворках, а в синхронном DOM. В нативе нельзя случайно заставить систему пересчитать вёрстку посреди кадра, а в вебе можно.
- Поэтому в вебе дисциплину кадра приходится добавлять самим: планировщиком, как в Teact, или настройкой Preact.

На этом всё. Если вы пишете на Flutter, SwiftUI или Compose и видите неточность, напишите мне, ссылки есть на главной. Спасибо, что дочитали!

## Источники

Документацию и исходники я смотрел 21 ноября 2026. Версии на этот момент: React 19.3, Vue 3.5, Svelte 5.59, Solid 2.0, Angular 22, Flutter 3.50.

Браузер:

- [HTML Living Standard: event loop processing model](https://html.spec.whatwg.org/multipage/webappapis.html#event-loop-processing-model): порядок задач, микрозадач и обновления отрисовки
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)

Веб-фреймворки:

- [React: Queueing a Series of State Updates](https://react.dev/learn/queueing-a-series-of-state-updates) и [автоматический батчинг в React 18](https://github.com/reactwg/react-18/discussions/21)
- Исходники React: [ReactFiberRootScheduler.js](https://raw.githubusercontent.com/facebook/react/main/packages/react-reconciler/src/ReactFiberRootScheduler.js), [ReactEventPriorities.js](https://raw.githubusercontent.com/facebook/react/main/packages/react-reconciler/src/ReactEventPriorities.js), [Scheduler.js](https://raw.githubusercontent.com/facebook/react/main/packages/scheduler/src/forks/Scheduler.js), [SchedulerFeatureFlags.js](https://raw.githubusercontent.com/facebook/react/main/packages/scheduler/src/SchedulerFeatureFlags.js)
- [Vue: Reactivity Fundamentals](https://vuejs.org/guide/essentials/reactivity-fundamentals.html), [Vue: Watchers](https://vuejs.org/guide/essentials/watchers.html), исходник [scheduler.ts](https://raw.githubusercontent.com/vuejs/core/main/packages/runtime-core/src/scheduler.ts)
- [Svelte: $effect](https://svelte.dev/docs/svelte/$effect), [Svelte: flushSync и tick](https://svelte.dev/docs/svelte/svelte), исходник [batch.js](https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/src/internal/client/reactivity/batch.js)
- [README @solidjs/signals](https://raw.githubusercontent.com/solidjs/solid/main/packages/signals/README.md) и исходник [scheduler.ts](https://raw.githubusercontent.com/solidjs/solid/main/packages/signals/src/core/scheduler.ts)
- [Angular: Zoneless](https://angular.dev/guide/zoneless), исходники [zoneless_scheduling_impl.ts](https://raw.githubusercontent.com/angular/angular/main/packages/core/src/change_detection/scheduling/zoneless_scheduling_impl.ts) и [callback_scheduler.ts](https://raw.githubusercontent.com/angular/angular/main/packages/core/src/util/callback_scheduler.ts)

Flutter:

- [State.setState](https://api.flutter.dev/flutter/widgets/State/setState.html), [Element.markNeedsBuild](https://api.flutter.dev/flutter/widgets/Element/markNeedsBuild.html), [SchedulerPhase](https://api.flutter.dev/flutter/scheduler/SchedulerPhase.html), [WidgetsBinding.drawFrame](https://api.flutter.dev/flutter/widgets/WidgetsBinding/drawFrame.html)
- [RenderObject.markNeedsPaint](https://api.flutter.dev/flutter/rendering/RenderObject/markNeedsPaint.html), [RenderBox.size](https://api.flutter.dev/flutter/rendering/RenderBox/size.html), [LayoutBuilder](https://api.flutter.dev/flutter/widgets/LayoutBuilder-class.html), [addPostFrameCallback](https://api.flutter.dev/flutter/scheduler/SchedulerBinding/addPostFrameCallback.html)
- [Flutter performance profiling](https://docs.flutter.dev/perf/ui-performance) и [Performance best practices](https://docs.flutter.dev/perf/best-practices): потоки и бюджет кадра

Apple:

- [UIView.setNeedsLayout](https://developer.apple.com/documentation/uikit/uiview/setneedslayout()), [UIView.layoutIfNeeded](https://developer.apple.com/documentation/uikit/uiview/layoutifneeded()), [UIView.setNeedsDisplay](https://developer.apple.com/documentation/uikit/uiview/setneedsdisplay())
- [CATransaction](https://developer.apple.com/documentation/quartzcore/catransaction), [CADisplayLink](https://developer.apple.com/documentation/quartzcore/cadisplaylink), [Optimizing apps for ProMotion displays](https://developer.apple.com/documentation/quartzcore/optimizing-iphone-and-ipad-apps-to-support-promotion-displays)
- [Explore UI animation hitches and the render loop](https://developer.apple.com/videos/play/tech-talks/10855/) и [WWDC25: Optimize SwiftUI performance with Instruments](https://developer.apple.com/videos/play/wwdc2025/306/)

Android:

- [Choreographer](https://developer.android.com/reference/android/view/Choreographer), [View](https://developer.android.com/reference/android/view/View), [Slow rendering](https://developer.android.com/topic/performance/issues/render)
- [Jetpack Compose phases](https://developer.android.com/develop/ui/compose/phases), исходники [Recomposer.kt](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/compose/runtime/runtime/src/commonMain/kotlin/androidx/compose/runtime/Recomposer.kt) и [AndroidUiFrameClock.android.kt](https://android.googlesource.com/platform/frameworks/support/+/refs/heads/androidx-main/compose/ui/ui/src/androidMain/kotlin/androidx/compose/ui/platform/AndroidUiFrameClock.android.kt)
