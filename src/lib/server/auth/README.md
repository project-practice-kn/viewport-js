# Авторизация

В `index.ts` создаётся Better Auth с Drizzle adapter, email/password и cookie-сессиями. `requireUser` перенаправляет неавторизованного пользователя на вход. Hook и каждый защищённый маршрут проверяют доступ отдельно.
