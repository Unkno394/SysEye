# Telegram Bot Webhook

`SysEye` can publish task events to an external bot service over HTTP.

## Backend config

Use the `TelegramBotNotificationsOptions` section or matching environment variables:

```json
{
  "TelegramBotNotificationsOptions": {
    "Enabled": true,
    "Endpoint": "http://telegram-bot:8081/internal/notifications",
    "Secret": "change-me",
    "SecretHeaderName": "X-Webhook-Secret",
    "TimeoutSeconds": 5
  }
}
```

Env names:

```text
TelegramBotNotificationsOptions__Enabled=true
TelegramBotNotificationsOptions__Endpoint=http://telegram-bot:8081/internal/notifications
TelegramBotNotificationsOptions__Secret=change-me
TelegramBotNotificationsOptions__SecretHeaderName=X-Webhook-Secret
TelegramBotNotificationsOptions__TimeoutSeconds=5
```

## Events

The backend sends notifications for:

- `task.queued`
- `task.updated`

`task.updated` is emitted on task completion, not for every output chunk.

## Request

Method:

```text
POST /internal/notifications
```

Headers:

```text
Content-Type: application/json
X-Webhook-Secret: <Secret>
```

Body example:

```json
{
  "eventType": "task.updated",
  "userId": "11111111-1111-1111-1111-111111111111",
  "agentId": "22222222-2222-2222-2222-222222222222",
  "taskId": "33333333-3333-3333-3333-333333333333",
  "status": "error",
  "title": "Disk cleanup",
  "error": "Access denied",
  "exitCode": 1,
  "createdAt": "2026-04-04T10:15:00Z"
}
```

## Notes for the bot service

- Map `userId` to the authenticated site user in the bot project.
- Send Telegram messages only for chats that enabled notifications.
- Return any `2xx` response to mark delivery as accepted.
- Non-`2xx` responses are logged by the backend, but do not block task execution.
