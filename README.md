# Блог

Минималистичный блог на [Astro](https://astro.build): записи — обычные `.md` файлы, страницы собираются в статику, сервер нужен только для лайков.

## Запуск

Нужен Node.js 20 или новее.

```bash
npm install
npm run dev        # http://localhost:4321
```

## Новая запись

Создай файл `src/content/posts/<адрес>.md`. Имя файла станет адресом: `perf-120fps.md` → `/posts/perf-120fps/`.

```md
---
title: Заголовок записи
date: 2026-11-21
excerpt: Одна-две строки для списка на главной
tags: [react, perf]
draft: true        # черновик: виден только в npm run dev
---

Текст в markdown. Код, таблицы, цитаты и картинки поддерживаются.

![Подпись под картинкой](/images/my-picture.png)
```

Картинки клади в `public/images/`. Если картинка стоит отдельным абзацем, её alt становится подписью под ней.

## Про себя

Имя, должность, описание и ссылки меняются в `src/site.config.ts`.
Фото: положи файл в `public/` (например `public/avatar.jpg`) и поменяй `avatar` в том же файле.

## Лайки

- `GET /api/likes?slugs=a,b` возвращает счётчики, `POST /api/likes` с `{ "slug": "...", "action": "like" | "unlike" }` меняет их.
- Счётчики хранятся в `data/likes.json`. Путь меняется переменной `LIKES_FILE`.
- Повторный лайк из того же браузера снимает лайк. С одного IP не больше 30 действий за 10 минут.
- Если сайт стоит за nginx или Caddy, задай `TRUST_PROXY=1`, чтобы лимит считался по реальному IP из `X-Forwarded-For`.

## Деплой

```bash
npm run build
npm start          # node ./dist/server/entry.mjs, порт задаётся переменной PORT
```

Подходит любой VPS с Node.js. Файл `data/likes.json` должен лежать на постоянном диске: на платформах без него (Vercel, Netlify) замени хранилище в `src/lib/likes.ts` на Redis или базу данных.
