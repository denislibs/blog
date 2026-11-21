---
title: 'Перформанс-гайдлайн: анимации на 120 fps'
date: 2026-11-21
excerpt: Бюджет кадра при 60 и 120 Гц, что можно анимировать без рефлоу и чек-лист для ревью.
tags: [perf, css]
---

Анимация выглядит плавной, когда каждый кадр укладывается в бюджет: **16,7 мс** при 60 Гц и **8,3 мс** при 120 Гц. Из этого бюджета 2–3 мс браузер забирает себе, так что нашему коду остаётся совсем немного.

## Как браузер рисует кадр

```text
JS → Style → Layout → Paint → Composite
```

Чем левее этап, который запускает изменение, тем дороже кадр. Смена `width` гонит весь конвейер, смена `transform` трогает только композитинг.

## Что анимировать

| Свойство | Этапы | Цена |
| --- | --- | --- |
| `transform`, `opacity` | Composite | дёшево |
| `color`, `box-shadow` | Paint → Composite | средне |
| `width`, `top`, `margin` | Layout → Paint → Composite | дорого |

## Без лишних рефлоу

Сначала все чтения, потом все записи. Если их чередовать, браузер пересчитывает layout на каждой итерации:

```js
// плохо: read → write → read → write
items.forEach(el => {
  el.style.height = el.offsetWidth / 2 + 'px';
});

// хорошо: сначала читаем, потом пишем
const widths = items.map(el => el.offsetWidth);
items.forEach((el, i) => {
  el.style.height = widths[i] / 2 + 'px';
});
```

## Время вместо кадров

На 120 Гц `requestAnimationFrame` вызывается вдвое чаще. Двигайте по времени, а не по счётчику кадров:

```js
function tick(now) {
  const t = Math.min((now - start) / duration, 1);
  el.style.transform = `translateX(${ease(t) * 240}px)`;
  if (t < 1) requestAnimationFrame(tick);
}
```

> Правило ревью: если анимация трогает layout, причина должна быть записана в комментарии.

## Чек-лист

- анимируем только `transform` и `opacity`;
- `will-change` ставим перед анимацией и снимаем после;
- длинные списки рендерим через `content-visibility: auto`;
- проверяем в DevTools → Performance с замедлением CPU ×4.
