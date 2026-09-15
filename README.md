# Newo-clone — отдельный фронтенд-сервер

Node.js/Express + React. Полностью отделён от Python-бэкенда (FastAPI) —
общается с ним только по HTTP, как любой внешний клиент. Бэкенд не
модифицируется и ничего не знает про существование этого сервера.

## Архитектура

```
Браузер клиента/админа
        │
        ▼
Express-сервер (порт 3000 по умолчанию)
  ├── отдаёт собранный React (client/dist)
  ├── /api/chat, /api/health           → проксирует к бэкенду напрямую
  └── /api/admin/*                      → проксирует к бэкенду,
        (кроме /login,/logout,/me)        подставляя Basic Auth из
                                           СЕРВЕРНОЙ сессии (не из браузера)
        │
        ▼
FastAPI-бэкенд (порт 8000, как и был — без изменений)
```

Почему так, а не прямые запросы из браузера в FastAPI:

1. **Пароль админки не должен попадать в браузер.** FastAPI использует HTTP
   Basic Auth. Если бы React сам хранил логин/пароль (localStorage, etc.) —
   их было бы видно в devtools. Здесь пароль вводится один раз при логине,
   Express проверяет его пробным запросом к бэкенду и хранит только в
   серверной httpOnly-cookie сессии. Браузер пароль после логина больше не
   видит вообще.
2. **CORS не нужен.** Бэкенд не настроен (и мы его не трогаем) отдавать
   заголовки для чужого origin. Раз браузер обращается только к Express
   (тот же origin, что и сам React), проблема просто не возникает.

## Структура

```
frontend-server/
├── server/          Express BFF-сервер
│   ├── server.js
│   └── package.json
└── client/          React (Vite)
    ├── src/
    │   ├── App.jsx           — маршрутизация: "/" чат, "/admin" панель
    │   ├── api.js             — единая точка всех fetch() к /api/*
    │   ├── pages/
    │   │   ├── Login.jsx
    │   │   └── AdminDashboard.jsx
    │   └── components/
    │       ├── ChatWidget.jsx
    │       ├── KbPanel.jsx
    │       ├── ConnectorsPanel.jsx
    │       └── SettingsPanel.jsx
    └── package.json
```

## Запуск в разработке

Два терминала:

```bash
# Терминал 1 — бэкенд (как и раньше, ничего не поменялось)
cd /opt/newo_clone && source venv/bin/activate && uvicorn main:app --port 8000

# Терминал 2 — Express (без билда React — раздаёт dev-заглушку/API)
cd frontend-server/server
npm install
SESSION_SECRET=dev-secret BACKEND_URL=http://127.0.0.1:8000 npm run dev

# Терминал 3 — Vite dev-сервер с hot reload (проксирует /api на :3000)
cd frontend-server/client
npm install
npm run dev
```
Откройте `http://localhost:5173` (Vite) — это для разработки. React будет
проксировать `/api/*` на Express через `vite.config.js`.

## Продакшн-сборка и деплой

```bash
cd frontend-server/client
npm install
npm run build          # создаст client/dist

cd ../server
npm install --omit=dev
```

Задайте переменные окружения (например, через systemd-юнит, аналогично
бэкенду):
```
BACKEND_URL=http://127.0.0.1:8000
SESSION_SECRET=длинная-случайная-строка-замените-обязательно
PORT=3001
COOKIE_SECURE=false   # true — когда появится HTTPS
```

Запуск:
```bash
node server.js
```

### systemd-юнит (по аналогии с бэкендом)

```ini
[Unit]
Description=Newo-clone Frontend Server
After=network.target newo-clone.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/newo_clone_frontend/server
EnvironmentFile=/opt/newo_clone_frontend/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Nginx

Бэкенд остаётся на своём порту/пути, фронтенд — на новом порту, например:
```nginx
server {
    listen 80;
    server_name your-domain.example.com;

    location / {
        proxy_pass http://127.0.0.1:3001;   # frontend-server
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
Обратите внимание: снаружи виден только фронтенд-сервер на 80/443 — сам
FastAPI-бэкенд (порт 8000) не должен быть напрямую доступен из интернета,
только с localhost, как и было раньше.

## Что уже покрыто тестами (интеграционно, вручную)

- Публичный `/api/chat`, `/api/health` — сквозное проксирование, включая
  проброс кодов ошибок бэкенда
- `/api/admin/login` — неверный пароль → 401, верный → сессия создаётся
- `/api/admin/*` без сессии → 401 (даже не долетает до бэкенда)
- CRUD базы знаний через прокси-сессию — создание, чтение, удаление
  подтверждены сквозным HTTP-запросом, не только юнит-тестом
- Раздача собранного React + SPA-роутинг (любой путь отдаёт `index.html`,
  дальше маршрутизацию берёт React Router)

## Чего здесь пока нет (честно)

- Голосовой канал (`/voice/chat`) не проксируется — этот фронтенд пока
  только для текстового чата и админки, как договаривались на старте
- HTTPS — см. общий README проекта, тот же принцип применим и здесь
- Более одного админ-пользователя / ролей — сейчас один логин/пароль на
  всех, как и на бэкенде
