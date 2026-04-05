# Mandlscord — Деплой на Render + MongoDB Atlas + Cloudinary

## Шаг 1: MongoDB Atlas (бесплатная база данных)

1. Зайди на https://mongodb.com/cloud/atlas/register
2. Создай аккаунт (бесплатно)
3. Нажми **Build a Database** → выбери **FREE** (Shared)
4. Выбери регион ближе к себе (например, Frankfurt для Европы)
5. Нажми **Create**
6. Создай пользователя:
   - Username: `mandlscord`
   - Password: (запомни!)
7. В **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (0.0.0.0/0)
8. В **Database** → **Connect** → **Drivers** → скопируй строку подключения
9. Замени `<password>` на свой пароль
10. Это будет твой `MONGODB_URI`

## Шаг 2: Cloudinary (бесплатное хранилище файлов — 25GB)

1. Зайди на https://cloudinary.com/users/register/free
2. Создай аккаунт
3. В Dashboard скопируй **API Environment Variable**
4. Это будет твой `CLOUDINARY_URL`

## Шаг 3: GitHub

1. Создай репозиторий на https://github.com/new
2. Загрузи ВСЕ файлы из этой папки (render-deploy)
3. **НЕ загружай:** `node_modules/`, `dist/`, `mobile/`, `data.json`, `.env`

## Шаг 4: Render

1. Зайди на https://render.com → New → Web Service
2. Подключи свой GitHub репозиторий
3. Настройки:
   - **Name:** mandlscord
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `node server.js`
4. В **Environment Variables** добавь:
   - `MONGODB_URI` — строка из MongoDB Atlas
   - `CLOUDINARY_URL` — строка из Cloudinary
   - `JWT_SECRET` — любой длинный случайный набор символов
5. Нажми **Create Web Service**

## Шаг 5: Мобильное приложение

1. После деплоя ты получишь URL типа `https://mandlscord-xxx.onrender.com`
2. В мобильном приложении зайди в **Настройки** (шестерёнка)
3. Введи этот URL как адрес сервера
4. Готово!

## Что работает бесплатно

| Сервис | Что даёт | Лимит |
|---|---|---|
| Render | Сервер 24/7 | 750 часов/мес |
| MongoDB Atlas | База данных | 512MB |
| Cloudinary | Файлы (фото, видео, аудио) | 25GB |
| Jitsi | Групповые звонки | Без лимита |

## Локальный тест

```bash
# Без MongoDB (данные в памяти, только для теста)
node server.js

# С MongoDB
MONGODB_URI="твоя_строка" node server.js
```

Открой `http://localhost:3001`
