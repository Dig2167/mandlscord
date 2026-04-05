# Mandlscord — Деплой на Render

## Что в этой папке

Все файлы для запуска сервера на Render.

## Как загрузить на Render

### Шаг 1: Создай GitHub репозиторий
1. Зайди на https://github.com/new
2. Создай публичный репозиторий (например `mandlscord-server`)
3. Загрузи ВСЕ файлы из ЭТОЙ папки в репозиторий

### Шаг 2: Подключи к Render
1. Зайди на https://render.com
2. New → Web Service
3. Выбери свой GitHub репозиторий
4. Настройки:
   - **Name:** mandlscord
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
5. Нажми Create Web Service

### Шаг 3: Подожди деплой
Render соберёт и запустит сервер. Получишь URL типа `https://mandlscord-xxx.onrender.com`

## Как проверить локально

```bash
cd render-deploy
npm install
npm run build
node server.js
```

Открой `http://localhost:3001`

## Что НЕ нужно загружать

- `node_modules/`
- `dist/`
- `mobile/`
- `data.json`
