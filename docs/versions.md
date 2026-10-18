# Версии и совместимость

Проверено 18 октября 2026 года. Для всех прямых библиотек запрошен npm dist-tag `latest`, затем peerDependencies и engines. API проверены через Context7 по официальным источникам SvelteKit, Better Auth и Drizzle. Установка без `--force` и `--legacy-peer-deps`; точные версии закреплены lockfile.

## Выбранные версии

| Пакет                                | Версия         | Примечание                                                              |
| ------------------------------------ | -------------- | ----------------------------------------------------------------------- |
| Node.js                              | 24.x           | Текущая LTS-линия; локально 24.14.1; Docker template использует node:24 |
| svelte                               | 5.57.2         | latest                                                                  |
| @sveltejs/kit                        | 3.1.0          | latest; Node ≥22.17                                                     |
| @sveltejs/adapter-node               | 6.0.0          | latest, Kit 3                                                           |
| @sveltejs/vite-plugin-svelte         | 7.3.1          | latest, Vite 8                                                          |
| vite                                 | 8.3.4          | latest                                                                  |
| typescript                           | 6.0.3          | Последняя совместимая 6.x; latest 7.0.2 вне peer ranges                 |
| svelte-check                         | 4.7.7          | latest, TS 5/6                                                          |
| bulma                                | 1.0.4          | latest                                                                  |
| drizzle-orm                          | 0.45.4         | latest stable; prerelease 1.x не используется                           |
| drizzle-kit                          | 0.31.11        | latest stable                                                           |
| better-sqlite3                       | 13.0.3         | latest, нативный модуль                                                 |
| better-auth                          | 1.7.10         | latest; поддерживает Kit 3 и Drizzle 0.45.2+                            |
| @better-auth/drizzle-adapter         | 1.7.10         | Та же линия Better Auth                                                 |
| @aws-sdk/client-s3                   | 3.1152.0       | latest                                                                  |
| @aws-sdk/s3-request-presigner        | 3.1152.0       | latest, та же версия SDK                                                |
| sharp                                | 0.35.5         | latest                                                                  |
| archiver / @types/archiver           | 8.0.0 / 8.0.0  | latest                                                                  |
| @types/node                          | 24.19.2        | Последние типы для runtime 24, вместо latest для Node 26                |
| @opentelemetry/api                   | 1.9.1          | Обязательный peer SvelteKit; отдельный tracing сервис не вводится       |
| prettier / prettier-plugin-svelte    | 3.9.10 / 4.1.1 | latest                                                                  |
| tsx                                  | 4.23.15        | latest; TypeScript loader тестов                                        |
| actions/checkout, actions/setup-node | v7             | Актуальная major-линия официальных Actions                              |

## Изменения SvelteKit 3

- Конфигурация через `sveltekit({...})` в `vite.config.ts`, без `svelte.config.js`.
- `#lib/*` объявлен в package imports; расширения `.ts`/`.svelte` указаны явно.
- `tsconfig.json` расширяет `$app/tsconfig`, types синхронизируются `svelte-kit sync`.
- `building` импортируется из `$app/env`, `Handle` — из `@sveltejs/kit/hooks`.
- `paths.origin` задаёт канонический origin при сборке вместо runtime ORIGIN adapter-node. Учесть при будущей настройке auth/deployment; в шаблоне это не подключено.
- Для будущей интеграции Better Auth: отдельный `@better-auth/drizzle-adapter`, hook `svelteKitHandler` и последний plugin `sveltekitCookies(getRequestEvent)`.

## Известное замечание npm audit

На момент проверки npm сообщает четыре moderate записи в цепочке `drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils → esbuild@0.18`. Это одна проблема старого esbuild dev-server, [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), отражённая на нескольких пакетах. Приложение не запускает этот dev-server. Даже `--omit=dev` может включать цепочку, поскольку Better Auth объявляет Drizzle Kit optional peer.

Последний стабильный drizzle-kit пока содержит эту зависимость. Автоматический `npm audit fix --force` предлагает старую несовместимую ветку 0.18.1 и не применяется. Принудительные overrides API также не добавлены. Перепроверять при обновлении Drizzle Kit; audit не считается нулевым.

## Источники

- [SvelteKit 3 migration](https://svelte.dev/docs/kit/migrating-to-sveltekit-3).
- [SvelteKit adapter-node](https://svelte.dev/docs/kit/adapter-node).
- [Better Auth: SvelteKit](https://www.better-auth.com/docs/integrations/svelte-kit).
- [Better Auth: Drizzle adapter](https://www.better-auth.com/docs/adapters/drizzle).
- [Drizzle SQLite](https://orm.drizzle.team/docs/get-started-sqlite).
- [npm registry metadata](https://registry.npmjs.org/): dist-tags, engines и peerDependencies.
- [Checkout releases](https://github.com/actions/checkout/releases), [setup-node releases](https://github.com/actions/setup-node/releases).

Для обновления заново проверить registry и Context7, установить совместимую версию, сохранить package-lock и выполнить `npm run verify` ; подключение runtime-функций проверять в соответствующих задачах. Не путать «latest вообще» и «последняя совместимая версия».
