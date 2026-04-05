# Запуск Backend

## Варианты запуска

В проекте есть два compose-сценария:

- [docker-compose.yml](/home/user/Desktop/syseye/docker-compose.yml) — основной compose из корня репозитория
- [docker-compose.yml](/home/user/Desktop/syseye/bd/hackaton/docker-compose.yml) — отдельный compose внутри `bd/hackaton`

Важно: эти сценарии не эквивалентны.

- корневой compose собирает backend из локального исходного кода
- `bd/hackaton/docker-compose.yml` сейчас использует готовый image `podsolnuhhh/umir_hackaton:v0.1.1`

Если нужно поднять backend с актуальными локальными изменениями, используй корневой compose.

## Быстрый запуск из корня репозитория

Из `/home/user/Desktop/syseye`:

```bash
docker compose up -d --build
```

Только backend:

```bash
docker compose up -d --build backend
```

Остановка:

```bash
docker compose down
```

## Запуск через compose внутри `bd/hackaton`

Из `/home/user/Desktop/syseye/bd/hackaton`:

```bash
docker compose up -d
```

Остановка:

```bash
docker compose down
```

Этот способ подходит только если тебя устраивает запуск из опубликованного image.

## Локальные зависимости

Для полного окружения нужны:

- PostgreSQL
- Redis
- backend service
- frontend
- при необходимости `email-fallback`

## Проверка после старта

Backend health:

```bash
curl -i http://127.0.0.1:5000/health/live
```

Frontend:

```text
http://localhost:3001
```

## Полезные команды

Логи backend:

```bash
docker logs --tail 200 syseye-backend-1
```

или для compose внутри `bd/hackaton`:

```bash
docker logs --tail 200 hackaton-backend
```

Следить за логами:

```bash
docker logs -f syseye-backend-1
```

Проверить контейнер:

```bash
docker inspect --format '{{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}' syseye-backend-1
```

## Secrets

Для Docker используются файлы:

- [db_password.txt](/home/user/Desktop/syseye/bd/hackaton/secrets/db_password.txt)
- [jwt_secret.txt](/home/user/Desktop/syseye/bd/hackaton/secrets/jwt_secret.txt)
- [redis_password.txt](/home/user/Desktop/syseye/bd/hackaton/secrets/redis_password.txt)
- [email.txt](/home/user/Desktop/syseye/bd/hackaton/secrets/email.txt)
- [email_password.txt](/home/user/Desktop/syseye/bd/hackaton/secrets/email_password.txt)

## Частые проблемы

### Backend падает с `Secret должен быть больше 32 символов`

Проверь:

1. что `jwt_secret.txt` не пустой
2. что secret реально проброшен в контейнер
3. что запускается актуальная версия backend, а не старый image

Если используется `bd/hackaton/docker-compose.yml`, backend может стартовать из старого image и не видеть новую логику загрузки secrets.

### Изменения в коде не применяются

Причина почти всегда одна из двух:

1. backend запущен из готового image, а не собирается локально
2. контейнер не был пересобран

Для применения локальных изменений:

```bash
docker compose up -d --build backend
```

## Production-рекомендации

- использовать Docker Secrets
- не хранить реальные секреты в git
- выставить корректный `AllowedOrigins`
- задать production SMTP
- задать длинный JWT secret
- следить за healthcheck и restart policy
