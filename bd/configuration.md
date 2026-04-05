# Конфигурация Backend

Конфигурация загружается из:

## 🐳 Docker

- `.env`
- `Docker Secrets` через `/run/secrets/*`

## 💻 Локально

- `appsettings.json`
- локальные переменные окружения
- user secrets при необходимости

## ⚠️ Важно

Конфигурация валидируется через `IOptions` и `IValidateOptions`. Если обязательные значения отсутствуют или некорректны, приложение завершает запуск с ошибкой.

## 🔐 Secrets

Секреты читаются из `/run/secrets/*`.

Используются для:

| Секрет | Описание |
|---|---|
| `db_password` | Пароль PostgreSQL |
| `jwt_secret` | Секрет JWT |
| `redis_password` | Пароль Redis |
| `email` | Email отправителя |
| `email_password` | Пароль почты |

## 🧾 LoggingOptions

| Поле | Тип | Описание |
|---|---|---|
| `LogLevel` | `string` | Уровень логирования |
| `ConsoleEnabled` | `bool` | Включить вывод в консоль |
| `FileEnabled` | `bool` | Включить запись в файл |
| `LogPath` | `string` | Путь к лог-файлам |

## 🔐 JwtOptions

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

`JwtOptions__Secret` должен быть длиннее 32 символов.

## 🧪 SwaggerEnabled

| Поле | Тип | Описание |
|---|---|---|
| `SwaggerEnabled` | `bool` | Включить Swagger UI |

## 🔌 ConnectionOptions

| Поле | Тип | Описание |
|---|---|---|
| `DatabaseConnectionTemplate` | `string` | Шаблон строки подключения PostgreSQL |
| `RedisConnectionTemplate` | `string` | Шаблон строки подключения Redis |
| `RedisInstanceName` | `string` | Префикс ключей Redis |

📌 Важно:
пароли подставляются в `{0}` из secrets.

## 🔁 TransactionOptions

| Поле | Тип | Описание |
|---|---|---|
| `MaxRetryCount` | `int` | Максимальное число повторов |
| `EnableRetryOnFailure` | `bool` | Включить retry |
| `UseExponentialBackoff` | `bool` | Использовать exponential backoff |
| `FixedDelayMs` | `int` | Фиксированная задержка в миллисекундах |

## 🔑 ApiKeyOptions

| Поле | Тип | Описание |
|---|---|---|
| `ApiKeyHeader` | `string` | HTTP заголовок API ключа |
| `AgentIdHeader` | `string` | HTTP заголовок ID агента |
| `UseApiKeyAccess` | `bool` | Включить авторизацию по API ключу |

## 📬 SmtpOptions

| Поле | Тип | Описание |
|---|---|---|
| `Host` | `string` | SMTP сервер |
| `Name` | `string` | Имя отправителя |
| `Port` | `int` | Порт |
| `MaxRetryAttempts` | `int` | Количество попыток отправки |
| `UsePortAndSsl` | `bool` | Использовать SSL |
| `TimeoutSeconds` | `int` | Таймаут запроса |
| `RetryDelaySeconds` | `int` | Задержка между попытками |

Email и пароль берутся из secrets:

- `EMAIL`
- `EMAIL_PASSWORD`

## 📊 LokiOptions

| Поле | Тип | Описание |
|---|---|---|
| `BaseUrl` | `string` | URL Loki |
| `TimeoutSeconds` | `int` | Таймаут запросов |

## 📡 OpenTelemetryOptions

| Поле | Тип | Описание |
|---|---|---|
| `Endpoint` | `string` | Endpoint OTel Collector |

## 📧 EmailTemplateOptions

| Поле | Тип | Описание |
|---|---|---|
| `ResourcesPath` | `string` | Путь к шаблонам email |
| `EmailTemplateWithCodeFileName` | `string` | Имя HTML шаблона |

## 🔐 VerificationOptions

| Поле | Тип | Описание |
|---|---|---|
| `EmailTokenExpirationMinutes` | `int` | Время жизни кода подтверждения |
| `EmailTokenLength` | `int` | Длина кода подтверждения |
| `PasswordTokenExpirationMinutes` | `int` | Время жизни кода сброса пароля |
| `PasswordTokenLength` | `int` | Длина кода сброса пароля |

## 🌐 AllowedOrigins

| Поле | Тип | Описание |
|---|---|---|
| `AllowedOrigins` | `string` | Список разрешённых CORS origin |

📌 Формат:
строка через запятую.
