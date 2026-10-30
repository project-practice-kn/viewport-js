# Зависимости и совместимость

Версии прямых зависимостей закреплены в `package.json`, полный граф с integrity hashes — в `package-lock.json`. Требования к Node.js заданы в `engines` и `.node-version`; базовый образ — в Dockerfile. Эти файлы являются источником версий, отдельный список «актуальных latest» в документации не поддерживается.

## Конфигурация стека

- SvelteKit подключается через `sveltekit({...})` в `vite.config.ts`.
- `#lib/*` объявлен в package imports; расширения `.ts`/`.svelte` указываются явно.
- `tsconfig.json` наследует `$app/tsconfig`; типы маршрутов синхронизируются `svelte-kit sync`.
- `building` импортируется из `$app/env`, `Handle` — из `@sveltejs/kit/hooks`.
- `paths.origin` задаётся при сборке; тот же ORIGIN передаётся Better Auth при запуске. Смена origin требует пересборки.
- Better Auth использует `@better-auth/drizzle-adapter`; auth.handler обслуживает `/api/auth/`, hook заполняет locals, server actions передают Set-Cookie из asResponse.
- better-sqlite3 — нативный модуль. Для сборки на хосте могут потребоваться Python 3, make и C++ compiler; в Docker они устанавливаются на этапе builder.

## Обновление зависимостей

1. Сверить API и инструкции миграции через Context7, версии/engines/peerDependencies — через npm registry.
2. Обновить совместимый набор пакетов через npm, сохранив lockfile. Не редактировать lockfile вручную и не обходить конфликты через `--force` или `--legacy-peer-deps`.
3. Выполнить `npm ci`, `npm test`, `npm run verify` и интеграционные проверки затронутых функций.
4. Для изменений runtime или native modules пересобрать Docker-образ и проверить запуск контейнеров.
5. Результаты проверки и несовместимости записать в задаче обновления. Переход на TypeScript 7 отслеживается в [VP-033](../tasks/issues/VP-033.md).

`npm audit` запускается отдельно. Его вывод зависит от установленных версий и базы advisories; не считайте отсутствие ошибок сборки подтверждением отсутствия уязвимостей. Оценивайте затронутый код и путь использования, а не применяйте `npm audit fix --force` автоматически.
