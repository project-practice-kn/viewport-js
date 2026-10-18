# Viewport

Шаблон будущего сервиса фотогалерей. Сейчас здесь только структура проекта и минимальная страница для проверки dev-сервера.

## Запуск

Нужны Node.js 24 и npm. Если используете nvm, сначала установите нужную версию:

```sh
nvm install
nvm use
npm ci
npm run dev
```

Открыть http://localhost:5173. Страница показывает «Viewport — Шаблон SvelteKit запущен».

Для запуска не нужны `.env`, SQLite, S3 и другие сервисы. Аккаунтов, галерей, базы данных и бизнес-логики в шаблоне нет.

Для окружения с локальным S3 нужны также Docker и Docker Compose с доступом к Docker daemon. Порядок запуска агентом описан в [AGENTS.md](AGENTS.md), настройка SeaweedFS — в [docs/deployment.md](docs/deployment.md). Если Node.js 24 уже установлен, команды nvm можно пропустить. Для сборки нативных npm-пакетов могут понадобиться Python 3, make и C++ compiler.

## Подготовлено

- SvelteKit 3 + Svelte 5 + TypeScript 6, Vite и adapter-node.
- Bulma подключена к минимальному layout.
- Совместимые стабильные версии указанного стека закреплены в package.json и package-lock.json; API проверены через Context7.
- Каталоги будущих страниц, компонентов и серверных модулей.
- AGENTS.md, правила разработки и документация целевой архитектуры.
- 8 эпиков и 32 задачи с зависимостями, оценками и критериями приёмки.
- Команды проверки типов, форматирования и сборки, CI и шаблон Docker Compose.

Пакеты Better Auth, Drizzle, SQLite, AWS SDK, Sharp и Archiver установлены для последующей разработки. Они не подключены к приложению и не выполняют никаких операций.

## Структура

```text
src/
  routes/
    +page.svelte                 # единственная минимальная страница
    +layout.svelte               # Bulma и render children
    login/                       # будущая авторизация
    dashboard/galleries/[id]/    # будущий кабинет
    g/[token]/                   # будущая публичная галерея
    api/uploads/                 # будущие загрузки
    api/downloads/               # будущие скачивания
  lib/
    components/                  # место для компонентов
    styles/                      # место для стилей
    server/
      auth/
      db/
      galleries/
      photos/
      storage/
      sharing/
      downloads/
drizzle/                         # место для будущих миграций; сейчас пусто
static/
scripts/
tests/
docs/
tasks/
  epics/
  issues/
  templates/
AGENTS.md
CONTRIBUTING.md
Dockerfile
compose.yaml
```

Пустые каталоги сохранены через `.gitkeep` или README. Будущие маршруты не имеют обработчиков и возвращают обычный 404.

## Команды

| Команда                | Назначение                         |
| ---------------------- | ---------------------------------- |
| `npm run dev`          | Минимальный dev-сервер             |
| `npm run check`        | Проверка Svelte и TypeScript       |
| `npm run build`        | Проверка production-сборки шаблона |
| `npm start`            | Запуск собранного шаблона          |
| `npm run preview`      | Предпросмотр сборки                |
| `npm run format`       | Форматирование                     |
| `npm run format:check` | Проверка форматирования            |
| `npm run verify`       | check → format:check → build       |

## Документация

- [План разработки: 8 эпиков и 32 задачи](tasks/README.md).
- [Инструкции для агентов](AGENTS.md).
- [Правила разработки](CONTRIBUTING.md).
- [Целевая архитектура](docs/architecture.md).
- [Версии и совместимость](docs/versions.md).
- [Запуск и будущий deployment](docs/deployment.md).
- [Проверка шаблона](docs/verification.md).

Следующая задача — [VP-002: подключить SQLite и Drizzle](tasks/issues/VP-002.md).
