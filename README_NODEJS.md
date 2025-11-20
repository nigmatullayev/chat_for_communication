# Chat+Video v1 - Node.js Version

Это Node.js версия приложения Chat+Video v1, которая сохраняет всю функциональность оригинальной Python/FastAPI версии.

## Особенности

- ✅ Все функции оригинального приложения сохранены
- ✅ Та же структура API endpoints
- ✅ WebSocket для реального времени
- ✅ WebRTC для видео/аудио звонков
- ✅ Аутентификация через JWT
- ✅ Админ-панель
- ✅ Загрузка файлов и аватаров
- ✅ Реакции на сообщения
- ✅ Редактирование и удаление сообщений

## Требования

- Node.js 18+ 
- npm или yarn

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Инициализируйте базу данных:
```bash
npm run init-db
```

Или:
```bash
node init_db.js
```

3. Запустите сервер:
```bash
npm start
```

Для разработки с автоперезагрузкой:
```bash
npm run dev
```

## Доступ

- Web UI: http://localhost:8000
- API: http://localhost:8000/api

## Учетные данные по умолчанию

- Username: `admin`
- Password: `admin123`

⚠️ **Важно**: Измените пароль администратора после первого входа!

## Структура проекта

```
chat_for_conversition/
├── server.js                 # Главный файл сервера
├── init_db.js                # Инициализация базы данных
├── package.json              # Зависимости Node.js
├── backend/
│   ├── config.js             # Конфигурация
│   ├── database.js           # База данных (SQLite)
│   ├── auth.js               # Аутентификация
│   ├── audit.js              # Аудит логи
│   ├── websocket_manager.js  # WebSocket менеджер
│   └── routers/
│       ├── auth.js           # Роуты аутентификации
│       ├── admin.js          # Админ роуты
│       ├── users.js          # Роуты пользователей
│       └── messages.js       # Роуты сообщений
├── frontend/                 # Фронтенд (без изменений)
└── uploads/                  # Загруженные файлы
```

## API Endpoints

Все endpoints идентичны Python версии:

### Authentication
- `POST /api/auth/login` - Вход
- `POST /api/auth/refresh` - Обновить токен
- `POST /api/auth/logout` - Выход

### Users
- `GET /api/users/me` - Получить профиль
- `PUT /api/users/me` - Обновить профиль
- `PUT /api/users/me/password` - Изменить пароль
- `POST /api/users/me/avatar` - Загрузить аватар
- `GET /api/users/list` - Список пользователей
- `GET /api/users/:id` - Профиль пользователя

### Admin
- `POST /api/admin/users` - Создать пользователя
- `GET /api/admin/users` - Список всех пользователей
- `GET /api/admin/users/:id` - Детали пользователя
- `PUT /api/admin/users/:id` - Обновить пользователя
- `DELETE /api/admin/users/:id` - Удалить пользователя
- `PATCH /api/admin/users/:id/toggle-active` - Активировать/деактивировать
- `GET /api/admin/audit_logs` - Логи аудита
- `GET /api/admin/notifications` - Уведомления

### Messages
- `GET /api/messages/conversations` - Список conversations
- `GET /api/messages/:userId` - История чата
- `PUT /api/messages/:messageId` - Редактировать сообщение
- `DELETE /api/messages/:messageId` - Удалить сообщение
- `POST /api/messages/:messageId/reactions` - Добавить реакцию
- `DELETE /api/messages/:messageId/reactions` - Удалить реакцию
- `POST /api/messages/upload` - Загрузить медиа
- `WebSocket /api/messages/ws/:userId` - WebSocket для реального времени

## Переменные окружения

Создайте файл `.env`:

```env
SECRET_KEY=your-super-secret-key-change-in-production
DATABASE_URL=sqlite:///./chat_video.db
ACCESS_TOKEN_EXPIRE_MINUTES=30
REFRESH_TOKEN_EXPIRE_DAYS=7
PORT=8000
```

## Миграция с Python версии

База данных SQLite полностью совместима с Python версией. Вы можете использовать существующую базу данных без изменений.

## Различия с Python версией

1. **Технологии**: Node.js/Express вместо Python/FastAPI
2. **База данных**: better-sqlite3 вместо SQLModel
3. **WebSocket**: библиотека `ws` вместо FastAPI WebSocket
4. **Остальное**: Все функции идентичны

## Разработка

Для разработки с автоперезагрузкой:

```bash
npm run dev
```

Или используйте nodemon:

```bash
npx nodemon server.js
```

## Производство

Для production рекомендуется:

1. Использовать переменные окружения для конфигурации
2. Настроить HTTPS через reverse proxy (nginx)
3. Использовать процесс-менеджер (PM2)
4. Настроить логирование
5. Регулярные бэкапы базы данных

Пример запуска с PM2:

```bash
npm install -g pm2
pm2 start server.js --name chat-video
```

## Лицензия

MIT License

