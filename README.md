# SysEye

![.NET](https://img.shields.io/badge/.NET%208-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)
![C#](https://img.shields.io/badge/C%23-239120?style=for-the-badge&logo=csharp&logoColor=white)
![ASP.NET Core](https://img.shields.io/badge/ASP.NET%20Core-5C2D91?style=for-the-badge&logo=dotnet&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![SignalR](https://img.shields.io/badge/SignalR-512BD4?style=for-the-badge&logo=dotnet&logoColor=white)
![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-000000?style=for-the-badge&logo=opentelemetry&logoColor=white)

SysEye — это система агентов диагностики и управления командами. Платформа получает задачи от основной системы, отправляет их агентам, хранит историю запусков, логи, аналитику и показывает всё это в веб-интерфейсе.

Система решает задачу удалённой инфраструктурной диагностики:

- какие машины доступны и активны;
- какие проверки на них запускались;
- какие результаты и ошибки были получены;
- что изменилось между двумя запусками;
- как быстро и стабильно работают агенты.

## Состав решения

В репозитории собраны основные части платформы:

- `front` — веб-интерфейс на Next.js;
- `bd` — backend на ASP.NET Core / .NET 8;
- `cli-agent` — Python CLI-агент для подключения машины;
- `email-fallback` — вспомогательный сервис для email-потоков;
- `docker-compose.yml` — основной сценарий запуска всего решения из корня репозитория.

## Основные возможности

### Агенты

- регистрация агента через connection token;
- heartbeat и отслеживание online/offline;
- переподключение агента;
- запуск команд и сценариев;
- ограничение количества параллельных задач на одном агенте;
- история запусков, stdout/stderr и execution logs.

### Команды и сценарии

- сохранённые команды для Linux и Windows;
- системные и пользовательские команды;
- placeholders для параметризованных команд;
- сценарии как последовательность шагов;
- запуск на одном агенте и по группе агентов.

### Аналитика

- количество запусков;
- среднее время выполнения;
- число ошибок за день;
- аналитика по агентам;
- аналитика по командам;
- рейтинг агентов по стабильности и скорости;
- экспорт результатов в `JSON`, `CSV`, `PDF`.

### Безопасность

- JWT и cookie-сессии;
- подтверждение email;
- сброс пароля по email;
- API key для агента;
- токен подключения агента;
- базовая авторизация для UI и API.

### Realtime и наблюдаемость

- realtime-обновления через SignalR;
- логи выполнения задач;
- экспорт логов и аналитики;
- интеграция с OpenTelemetry и Loki;
- фоновые задачи через Hangfire.

## Базовые проверки

Система ориентирована на инфраструктурные проверки и диагностику:

- hostname;
- IP-адреса;
- сетевые интерфейсы;
- версия ОС;
- список доступных сервисов или портов;
- выполнение заранее заданных диагностических команд;
- сбор базовой сетевой информации;
- сравнение результатов между двумя запусками.

Дополнительно реализованы:

- пропуск прерванных циклических команд в сравнении;
- история изменений по машине;
- краткие автоматические сводки по результатам проверки;
- прогресс выполнения сценариев по шагам.

## Архитектура

Высокоуровневый поток выглядит так:

1. пользователь работает через веб-интерфейс;
2. frontend отправляет запросы в backend;
3. backend управляет агентами, задачами, логами и аналитикой;
4. агент подключается к backend по token/API key;
5. агент получает команды, исполняет их и возвращает результат;
6. backend сохраняет историю и рассылает realtime-события;
7. email и фоновые задачи обрабатываются через отдельные сервисы и Hangfire.

## Стек технологий

### Backend

- `C# / .NET 8`
- `ASP.NET Core`
- `Entity Framework Core`
- `SignalR`
- `PostgreSQL`
- `Redis`
- `Hangfire`
- `OpenTelemetry`
- `Grafana Loki`
- `SMTP (MailKit)`

### Frontend

- `Next.js`
- `React`
- server-rendered и SPA-подход для dashboard-части

### Agent

- `Python`
- CLI / daemon-подход
- работа через HTTP + realtime

### Инфраструктура

- `Docker`
- `Docker Compose`

## Запуск проекта

Подробный запуск backend уже описан в [run.md](/home/user/Desktop/syseye/bd/run.md).

Основной рекомендуемый запуск всего проекта:

```bash
cd /home/user/Desktop/syseye
docker compose up -d --build
```

Остановка:

```bash
docker compose down
```

Проверка контейнеров:

```bash
docker compose ps
```

После запуска основные адреса такие:

- frontend: `http://localhost:3001`
- backend: `http://localhost:5000`

Важно:

- для сайта наружу должен открываться `frontend`, а не `backend`;
- если домен смотрит на `5000`, браузер попадёт в ASP.NET API и будет получать `404`.

## Структура репозитория

```text
syseye/
├── README.md
├── docker-compose.yml
├── bd/
│   ├── README.md
│   ├── configuration.md
│   ├── run.md
│   ├── telegram-bot-webhook.md
│   ├── hackaton/
│   │   ├── .env
│   │   └── secrets/
│   └── src/
│       ├── Application/
│       ├── Domain/
│       ├── Infrastructure/
│       └── Hackaton/
├── front/
├── cli-agent/
└── email-fallback/
```

## Конфигурация Backend

Конфигурация загружается из:

### Docker

- `.env`
- `Docker Secrets` (`/run/secrets/*`)

### Локально

- `appsettings.json`
- `user secrets`

### Важно

Конфигурация валидируется через `IOptions`.

Подробно: [configuration.md](/home/user/Desktop/syseye/bd/configuration.md)

## Secrets (обязательные)

Секреты читаются из `/run/secrets/*`.

Используются для:

| Секрет | Описание |
|---|---|
| `db_password` | Пароль PostgreSQL |
| `jwt_secret` | Секрет JWT |
| `redis_password` | Пароль Redis |
| `email` | Email отправителя |
| `email_password` | Пароль почты |

## LoggingOptions

| Поле | Тип | Описание |
|---|---|---|
| `LogLevel` | `string` | Уровень логирования |
| `ConsoleEnabled` | `bool` | Включить вывод в консоль |
| `FileEnabled` | `bool` | Включить запись в файл |
| `LogPath` | `string` | Путь к лог-файлам |

## JwtOptions

| Поле | Тип | Описание |
|---|---|---|
| `AccessCookieName` | `string` | Cookie для access токена |
| `RefreshCookieName` | `string` | Cookie для refresh токена |
| `ResetPasswordCookieName` | `string` | Cookie для сброса пароля |
| `UserIdCookieName` | `string` | Cookie с ID пользователя |
| `SessionCookieName` | `string` | Cookie сессии |
| `Issuer` | `string` | Издатель токена |
| `Audience` | `string` | Аудитория |
| `AccessTokenExpirationMinutes` | `int` | Время жизни access токена |
| `RefreshTokenExpirationDays` | `int` | Время жизни refresh токена |

## SwaggerEnabled

| Поле | Тип | Описание |
|---|---|---|
| `SwaggerEnabled` | `bool` | Включить Swagger UI |

## ConnectionOptions

| Поле | Тип | Описание |
|---|---|---|
| `DatabaseConnectionTemplate` | `string` | Шаблон строки подключения PostgreSQL |
| `RedisConnectionTemplate` | `string` | Шаблон строки подключения Redis |
| `RedisInstanceName` | `string` | Префикс ключей Redis |

Важно:
пароли подставляются в `{0}` из secrets.

## TransactionOptions

| Поле | Тип | Описание |
|---|---|---|
| `MaxRetryCount` | `int` | Максимальное число повторов |
| `EnableRetryOnFailure` | `bool` | Включить retry |
| `UseExponentialBackoff` | `bool` | Использовать exponential backoff |
| `FixedDelayMs` | `int` | Фиксированная задержка (мс) |

## ApiKeyOptions

| Поле | Тип | Описание |
|---|---|---|
| `ApiKeyHeader` | `string` | HTTP заголовок API ключа |
| `AgentIdHeader` | `string` | HTTP заголовок ID агента |
| `UseApiKeyAccess` | `bool` | Включить авторизацию по API ключу |

## SmtpOptions

| Поле | Тип | Описание |
|---|---|---|
| `Host` | `string` | SMTP сервер |
| `Name` | `string` | Имя отправителя |
| `Port` | `int` | Порт |
| `MaxRetryAttempts` | `int` | Количество попыток отправки |
| `UsePortAndSsl` | `bool` | Использовать SSL |
| `TimeoutSeconds` | `int` | Таймаут запроса |
| `RetryDelaySeconds` | `int` | Задержка между попытками |

## LokiOptions

| Поле | Тип | Описание |
|---|---|---|
| `BaseUrl` | `string` | URL Loki |
| `TimeoutSeconds` | `int` | Таймаут запросов |

## OpenTelemetryOptions

| Поле | Тип | Описание |
|---|---|---|
| `Endpoint` | `string` | Endpoint OTel Collector |

## EmailTemplateOptions

| Поле | Тип | Описание |
|---|---|---|
| `ResourcesPath` | `string` | Путь к шаблонам email |
| `EmailTemplateWithCodeFileName` | `string` | Имя HTML шаблона |

## VerificationOptions

| Поле | Тип | Описание |
|---|---|---|
| `EmailTokenExpirationMinutes` | `int` | Время жизни кода подтверждения |
| `EmailTokenLength` | `int` | Длина кода подтверждения |
| `PasswordTokenExpirationMinutes` | `int` | Время жизни кода сброса пароля |
| `PasswordTokenLength` | `int` | Длина кода сброса пароля |

## AllowedOrigins

| Поле | Тип | Описание |
|---|---|---|
| `AllowedOrigins` | `string` | Список разрешённых CORS origin |

Формат:
строка через запятую.

## Backend

Бэкенд-сервис для системы агентов диагностики и управления командами.

### Стек backend

- `C# / .NET 8`
- `ASP.NET Core`
- `Entity Framework Core`
- `SignalR` — realtime взаимодействие:
  - frontend ↔ backend
  - backend ↔ agents
- `PostgreSQL` — основная база данных
- `Redis` — кратковременные сущности
- `Hangfire` — очередь фоновых задач
- `OpenTelemetry` — сбор логов и метрик
- `Grafana Loki` — хранение логов
- `SMTP (MailKit)` — отправка почты

### Email система

Схема работы:

1. API ставит задачу в очередь
2. Hangfire обрабатывает её
3. письмо отправляется в фоне через SMTP

### Аутентификация

Используется JWT:

- `Access Token`
- `Refresh Token`
- `Cookies` для хранения

Дополнительно:

- подтверждение email
- сброс пароля через email

### Логирование и мониторинг

- агенты отправляют логи в backend по вебсокету / SignalR;
- backend экспортирует их в OpenTelemetry Collector по gRPC;
- collector обрабатывает и отправляет данные в Loki.

## Frontend

Frontend расположен в `front` и отвечает за:

- регистрацию и вход;
- dashboard агентов;
- страницы агента и группы;
- историю выполнения и логи;
- сценарии и команды;
- аналитику и экспорт;
- настройки профиля и подтверждение email.

## CLI Agent

Агент расположен в `cli-agent`.

Что он делает:

- подключается по connection token;
- создаёт или восстанавливает agent record;
- шлёт heartbeat;
- получает и выполняет задачи;
- отправляет stdout/stderr и финальный статус;
- может запускаться как background-процесс или сервис.

Подробности: [README.md](/home/user/Desktop/syseye/cli-agent/README.md)

## Telegram Bot

В решении предусмотрен Telegram bot для авторизации пользователей через SysEye site API и доставки уведомлений о задачах в Telegram.

Что делает бот:

- логинит Telegram-пользователя в сайт через `POST /api/auth/login`;
- хранит site cookies и связанный `site_user_id`;
- показывает профиль через `/me`;
- показывает агентов через `/agents`;
- принимает внутренние task webhooks от SysEye;
- может дополнительно опрашивать историю задач и досылать пропущенные уведомления после рестарта.

### Команды бота

- `/start` или `/help` — показать помощь
- `/login` — начать flow входа
- `/me` — показать текущий профиль
- `/agents` — показать агентов аккаунта
- `/logout` — очистить site session
- `/notifications_on` — включить уведомления
- `/notifications_off` — выключить уведомления
- `/cancel` — отменить текущий input flow

### Конфигурация бота

Бот читает `.env` из корня своего проекта.

Обязательные переменные:

- `BOT_TOKEN`
- `SITE_BASE_URL`
- `SITE_LOGIN_PATH`
- `SITE_LOGOUT_PATH`
- `SITE_USER_INFO_PATH`

Необязательные переменные:

- `BOT_NAME=Shkets Auth Bot`
- `SITE_REFRESH_PATH=/api/auth/refresh`
- `SITE_AGENTS_PATH=/api/agent`
- `SITE_TIMEOUT_SECONDS=5`
- `SESSION_STORAGE_PATH=data/sessions.json`
- `NOTIFICATION_STORAGE_PATH=data/notification_settings.json`
- `TASK_STATE_STORAGE_PATH=data/task_notification_state.json`
- `INTERNAL_NOTIFICATIONS_ENABLED=true`
- `INTERNAL_NOTIFICATIONS_HOST=0.0.0.0`
- `INTERNAL_NOTIFICATIONS_PORT=8081`
- `INTERNAL_NOTIFICATIONS_PATH=/internal/notifications`
- `INTERNAL_NOTIFICATIONS_SECRET=replace_me`
- `INTERNAL_NOTIFICATIONS_SECRET_HEADER=X-Webhook-Secret`
- `HISTORY_POLLING_ENABLED=true`
- `HISTORY_POLLING_INTERVAL_SECONDS=10`
- `HISTORY_POLLING_TAKE=20`

Минимальный локальный пример:

```env
BOT_TOKEN=123456:replace_me
BOT_NAME=Shkets Auth Bot

SITE_BASE_URL=http://127.0.0.1:5000
SITE_LOGIN_PATH=/api/auth/login
SITE_LOGOUT_PATH=/api/auth/logout
SITE_USER_INFO_PATH=/api/user/info
SITE_AGENTS_PATH=/api/agent

INTERNAL_NOTIFICATIONS_ENABLED=true
INTERNAL_NOTIFICATIONS_SECRET=replace_me
```

Запуск:

```bash
python run_bot.py
```

Если нужен полный путь до Python:

```bash
C:\Users\user\AppData\Local\Programs\Python\Python314\python.exe run_bot.py
```

### Storage

Бот хранит локальное состояние в JSON-файлах:

- `data/sessions.json` — site cookies, Telegram binding, linked `site_user_id`, last fetched profile
- `data/notification_settings.json` — состояние уведомлений
- `data/task_notification_state.json` — последнее доставленное состояние задачи для history polling

Пароли не сохраняются.

### Интеграция с SysEye

Когда `INTERNAL_NOTIFICATIONS_ENABLED=true`, бот поднимает внутренний HTTP receiver на настроенных host, port и path.

Ожидаемый запрос:

- `POST /internal/notifications`
- `Content-Type: application/json`
- secret header, по умолчанию `X-Webhook-Secret`
- JSON body с верхнеуровневым `userId`

Бот сопоставляет `webhook userId` со связанным `site_user_id` и отправляет уведомления только тем Telegram-пользователям, которые уже авторизованы и включили `/notifications_on`.

Если webhook временно потерян, history poller может подобрать изменения из site API позже.

### Примечания

- auth flow использует JSON login: `{"login":"...","password":"..."}`
- после login бот запрашивает `SITE_USER_INFO_PATH` и сохраняет site user id
- для локальной разработки сначала должен быть поднят сам SysEye

Дополнительно: [telegram-bot-webhook.md](/home/user/Desktop/syseye/bd/telegram-bot-webhook.md)

## Документация по подпроектам

- backend: [README.md](/home/user/Desktop/syseye/bd/README.md)
- backend configuration: [configuration.md](/home/user/Desktop/syseye/bd/configuration.md)
- backend run guide: [run.md](/home/user/Desktop/syseye/bd/run.md)
- cli-agent: [README.md](/home/user/Desktop/syseye/cli-agent/README.md)

## Важные замечания

- если нужны актуальные локальные изменения, поднимай проект из корня репозитория, а не из `bd/hackaton`;
- `bd/hackaton/docker-compose.yml` и корневой `docker-compose.yml` не эквивалентны;
- сайт должен открываться через `frontend`, а не через `backend`;
- конфигурация backend валидируется на старте;
- для production нужны корректные секреты, SMTP и `AllowedOrigins`.
