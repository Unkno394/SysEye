using System.Net.Http.Json;
using System.Text.Json;
using Application.DTO;
using Application.Interfaces;
using Infrastructure.Options;
using Infrastructure.DbContexts;
using Microsoft.Extensions.Options;
using Microsoft.EntityFrameworkCore;

namespace Web.Services;

public class TaskWebhookNotifier(
    HttpClient httpClient,
    IOptions<TelegramBotNotificationsOptions> options,
    AppDbContext context,
    ILogger<TaskWebhookNotifier> logger) : ITaskNotificationPublisher
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);
    private static readonly TimeSpan[] RetryDelays =
    [
        TimeSpan.FromMilliseconds(500),
        TimeSpan.FromSeconds(1),
        TimeSpan.FromSeconds(2),
    ];

    public Task PublishTaskQueuedAsync(
        Guid userId,
        Guid agentId,
        AgentTaskDto task,
        CancellationToken cancellationToken = default)
        => PublishAsync("task.queued", userId, agentId, task, cancellationToken);

    public Task PublishTaskUpdatedAsync(
        Guid userId,
        Guid agentId,
        AgentTaskDto task,
        CancellationToken cancellationToken = default)
        => PublishAsync("task.updated", userId, agentId, task, cancellationToken);

    private async Task PublishAsync(
        string eventType,
        Guid userId,
        Guid agentId,
        AgentTaskDto task,
        CancellationToken cancellationToken)
    {
        var settings = options.Value;
        if (!settings.Enabled)
            return;

        if (!Uri.TryCreate(settings.Endpoint, UriKind.Absolute, out var endpoint))
        {
            logger.LogWarning(
                "Пропущена отправка webhook-уведомления {EventType}: некорректный endpoint '{Endpoint}'",
                eventType,
                settings.Endpoint);
            return;
        }

        var agentName = await context.Agents.AsNoTracking()
            .Where(agent => agent.Id == agentId && agent.UserId == userId && !agent.IsDeleted)
            .Select(agent => agent.Name)
            .FirstOrDefaultAsync(cancellationToken)
            ?? string.Empty;

        using var request = new HttpRequestMessage(HttpMethod.Post, endpoint)
        {
            Content = JsonContent.Create(new TaskNotificationEventDto
            {
                EventType = eventType,
                UserId = userId,
                AgentId = agentId,
                AgentName = agentName,
                TaskId = task.Id,
                Status = task.Status,
                Title = task.Title,
                Output = task.Output,
                Error = task.Error,
                ExitCode = task.ExitCode,
                CreatedAt = task.CreatedAt,
            }, options: SerializerOptions)
        };

        if (!string.IsNullOrWhiteSpace(settings.Secret))
            request.Headers.TryAddWithoutValidation(settings.SecretHeaderName, settings.Secret);

        for (var attempt = 0; attempt <= RetryDelays.Length; attempt++)
        {
            using var requestClone = CloneRequest(request);

            try
            {
                using var response = await httpClient.SendAsync(requestClone, cancellationToken);
                if (response.IsSuccessStatusCode)
                    return;

                var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
                if (attempt < RetryDelays.Length && IsRetryableStatusCode((int)response.StatusCode))
                {
                    logger.LogWarning(
                        "Webhook-уведомление {EventType} вернуло HTTP {StatusCode}. Повтор {Attempt}/{MaxAttempts} через {DelayMs} мс. UserId: {UserId}, AgentId: {AgentId}, TaskId: {TaskId}, Body: {Body}",
                        eventType,
                        (int)response.StatusCode,
                        attempt + 1,
                        RetryDelays.Length,
                        (int)RetryDelays[attempt].TotalMilliseconds,
                        userId,
                        agentId,
                        task.Id,
                        Truncate(responseBody));
                    await Task.Delay(RetryDelays[attempt], cancellationToken);
                    continue;
                }

                logger.LogWarning(
                    "Webhook-уведомление {EventType} не доставлено. StatusCode: {StatusCode}, UserId: {UserId}, AgentId: {AgentId}, TaskId: {TaskId}, Body: {Body}",
                    eventType,
                    (int)response.StatusCode,
                    userId,
                    agentId,
                    task.Id,
                    Truncate(responseBody));
                return;
            }
            catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                if (attempt < RetryDelays.Length)
                {
                    logger.LogWarning(
                        "Webhook-уведомление {EventType} отменено по таймауту. Повтор {Attempt}/{MaxAttempts} через {DelayMs} мс. UserId: {UserId}, AgentId: {AgentId}, TaskId: {TaskId}",
                        eventType,
                        attempt + 1,
                        RetryDelays.Length,
                        (int)RetryDelays[attempt].TotalMilliseconds,
                        userId,
                        agentId,
                        task.Id);
                    await Task.Delay(RetryDelays[attempt], cancellationToken);
                    continue;
                }

                logger.LogWarning(
                    "Webhook-уведомление {EventType} отменено по таймауту. UserId: {UserId}, AgentId: {AgentId}, TaskId: {TaskId}",
                    eventType,
                    userId,
                    agentId,
                    task.Id);
                return;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                if (attempt < RetryDelays.Length)
                {
                    logger.LogWarning(
                        ex,
                        "Ошибка при отправке webhook-уведомления {EventType}. Повтор {Attempt}/{MaxAttempts} через {DelayMs} мс. UserId: {UserId}, AgentId: {AgentId}, TaskId: {TaskId}",
                        eventType,
                        attempt + 1,
                        RetryDelays.Length,
                        (int)RetryDelays[attempt].TotalMilliseconds,
                        userId,
                        agentId,
                        task.Id);
                    await Task.Delay(RetryDelays[attempt], cancellationToken);
                    continue;
                }

                logger.LogError(
                    ex,
                    "Ошибка при отправке webhook-уведомления {EventType}. UserId: {UserId}, AgentId: {AgentId}, TaskId: {TaskId}",
                    eventType,
                    userId,
                    agentId,
                    task.Id);
                return;
            }
        }
    }

    private static bool IsRetryableStatusCode(int statusCode)
        => statusCode is 408 or 429 or 502 or 503 or 504;

    private static string Truncate(string? value, int maxLength = 500)
    {
        if (string.IsNullOrWhiteSpace(value))
            return "<empty>";

        return value.Length <= maxLength
            ? value
            : value[..maxLength] + "...";
    }

    private static HttpRequestMessage CloneRequest(HttpRequestMessage request)
    {
        var clone = new HttpRequestMessage(request.Method, request.RequestUri);

        foreach (var header in request.Headers)
            clone.Headers.TryAddWithoutValidation(header.Key, header.Value);

        if (request.Content is not null)
        {
            var body = request.Content.ReadAsStringAsync().GetAwaiter().GetResult();
            var mediaType = request.Content.Headers.ContentType?.MediaType ?? "application/json";
            clone.Content = new StringContent(body);
            clone.Content.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue(mediaType);

            foreach (var header in request.Content.Headers)
            {
                if (header.Key.Equals("Content-Type", StringComparison.OrdinalIgnoreCase))
                    continue;

                clone.Content.Headers.TryAddWithoutValidation(header.Key, header.Value);
            }
        }

        return clone;
    }
}
