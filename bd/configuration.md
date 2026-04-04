# Конфигурация

Этот файл описывает все параметры конфигурации приложения, находящиеся в файле `appsettings.json`.

## LoggingOptions

Настройки логирования приложения.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `LogLevel` | `string` | Уровень логирования. |
| `ConsoleEnabled` | `bool` | Включено ли логирование в консоль. |
| `FileEnabled` | `bool` | Включено ли логирование в файл. |
| `LogPath` | `string` | Путь к файлу логов. |

## JwtOptions

Настройки, связанные с JWT-аутентификацией и cookie.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `AccessCookieName` | `string` | Имя cookie для access-токена. |
| `RefreshCookieName` | `string` | Имя cookie для refresh-токена. |
| `UserIdCookieName` | `string` | Имя cookie для ID пользователя. |
| `SessionCookieName` | `string` | Имя cookie для ID сессии. |
| `Issuer` | `string` | Выпускающий токен (issuer). |
| `Audience` | `string` | Аудитория токена (audience). |
| `AccessTokenExpirationMinutes` | `int` | Время жизни access-токена в минутах. |
| `RefreshTokenExpirationDays` | `int` | Время жизни refresh-токена в днях. |

## ConnectionOptions

Настройки подключения к базам данных.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `DatabaseConnectionTemplate` | `string` | Шаблон строки подключения к PostgreSQL. |
| `RedisConnectionTemplate` | `string` | Шаблон строки подключения к Redis. |
| `RedisInstanceName` | `string` | Префикс для ключей в Redis. |

## VerificationCacheOptions

Настройки времени жизни временных токенов (например, для подтверждения email или сброса пароля).

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `TokenExpirationMinutes` | `int` | Время жизни токена в минутах. |
| `EmailExpirationMinutes` | `int` | Время жизни email-ссылки в минутах. |

## TransactionOptions

Настройки повторных попыток выполнения транзакций.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `MaxRetryCount` | `int` | Максимальное количество попыток. |
| `EnableRetryOnFailure` | `bool` | Включить ли повторную попытку при ошибке. |
| `UseExponentialBackoff` | `bool` | Использовать ли экспоненциальную задержку между попытками. |
| `FixedDelayMs` | `int` | Фиксированная задержка между попытками в миллисекундах (если UseExponentialBackoff = false). |

## SmtpOptions

Настройки SMTP-сервера для отправки email.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `Host` | `string` | Адрес SMTP-сервера. |
| `Name` | `string` | Имя отправителя. |
| `Port` | `int` | Порт SMTP-сервера. |
| `MaxRetryAttempts` | `int` | Максимальное количество попыток отправки. |
| `TimeoutSeconds` | `int` | Таймаут ожидания в секундах. |
| `RetryDelaySeconds` | `int` | Задержка между попытками в секундах. |
| `UseSsl` | `bool` | Использовать ли SSL. |

## EmailTemplateOptions

Настройки шаблонов email-сообщений.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `ResourcesPath` | `string` | Путь к папке с ресурсами (шаблонами). |
| `EmailTemplateWithButtonFileName` | `string` | Имя файла HTML-шаблона с кнопкой. |

## MistralOptions

Настройки для взаимодействия с API Mistral AI.

| Параметр | Тип | Назначение |
|----------|-----|------------|
| `BaseUrl` | `string` | Базовый URL API. |
| `BaseAgentVersion` | `int` | Версия агента. |
| `RetryCount` | `int` | Количество попыток запроса. |
| `BaseAgentId` | `string` | ID агента. |

> **Примечание:** Все настройки валидируются при запуске приложения с помощью `IValidateOptions`.