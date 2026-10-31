# Авторизация

В `index.ts` создаётся Better Auth с Drizzle adapter, email/password и cookie-сессиями. `requireUser` перенаправляет неавторизованного пользователя на вход. Hook и каждый защищённый маршрут проверяют доступ отдельно.

`invite.ts` проверяет код `REGISTRATION_INVITE_CODE` через before hook регистрации. Пустая конфигурация закрывает регистрацию; код не хранится в БД и не возвращается в page data. HTML-форма и API вызывают `handleAuthRequest`, проходя один HTTP rate limiter. IP берётся из SvelteKit adapter, внутренний IP-заголовок всегда перезаписывается. Отказ возвращает 429 и стандартный `Retry-After`.
