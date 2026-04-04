using Application.Interfaces;
using Infrastructure.Options;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using Web.Contracts.Requests;
using Web.Extensions;

namespace Web.Hubs;

public class AgentHub(
    IApiKeyService apiKeyService,
    IAgentService agentService,
    ITaskService taskService,
    IOptions<ApiKeyOptions> options,
    ILogger<AgentHub> logger) : Hub
{
    private const string AgentIdItemKey = "AgentId";
    private const string UserIdItemKey = "UserId";

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Начало подключения агента. ConnectionId: {ConnectionId}", Context.ConnectionId);

        try
        {
            if (Context.User?.Identity?.IsAuthenticated == true)
            {
                var userId = Context.User.GetUserId();
                Context.Items[UserIdItemKey] = userId;

                var userGroupName = GetUserGroupName(userId);
                await Groups.AddToGroupAsync(Context.ConnectionId, userGroupName);

                logger.LogInformation(
                    "Подключён пользовательский realtime-клиент. UserId: {UserId}, ConnectionId: {ConnectionId}, Группа: {GroupName}",
                    userId,
                    Context.ConnectionId,
                    userGroupName);

                await base.OnConnectedAsync();
                return;
            }

            if (!options.Value.UseApiKeyAccess)
            {
                logger.LogInformation(
                    "Агент подключён без проверки API-ключа. ConnectionId: {ConnectionId}",
                    Context.ConnectionId);

                await base.OnConnectedAsync();
                return;
            }

            var httpContext = Context.GetHttpContext();
            if (httpContext is null)
            {
                logger.LogWarning(
                    "HttpContext отсутствует. ConnectionId: {ConnectionId}",
                    Context.ConnectionId);

                await RejectConnection("Контекст подключения недоступен");
                return;
            }

            var headers = httpContext.Request.Headers;

            if (!TryGetRequiredValue(httpContext, options.Value.ApiKeyHeader, "apiKey", out var apiKey))
            {
                logger.LogWarning(
                    "Не найден API-ключ '{HeaderName}'. ConnectionId: {ConnectionId}",
                    options.Value.ApiKeyHeader,
                    Context.ConnectionId);

                await RejectConnection("Отсутствует API-ключ");
                return;
            }

            if (!TryGetRequiredValue(httpContext, options.Value.AgentIdHeader, "agentId", out var agentId))
            {
                logger.LogWarning(
                    "Не найден AgentId '{HeaderName}'. ConnectionId: {ConnectionId}",
                    options.Value.AgentIdHeader,
                    Context.ConnectionId);

                await RejectConnection("Отсутствует идентификатор агента");
                return;
            }

            logger.LogInformation(
                "Получены заголовки подключения. AgentId: {AgentId}, ConnectionId: {ConnectionId}",
                agentId,
                Context.ConnectionId);

            var ownerId = await apiKeyService.GetOwnerIdByApiKey(apiKey);
            if (!ownerId.HasValue)
            {
                logger.LogWarning(
                    "Неверный API-ключ для агента {AgentId}. ConnectionId: {ConnectionId}",
                    agentId,
                    Context.ConnectionId);

                await RejectConnection("Неверный API-ключ");
                return;
            }

            Context.Items[AgentIdItemKey] = agentId;
            Context.Items[UserIdItemKey] = ownerId.Value;

            var groupName = GetAgentGroupName(agentId);
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
            await Groups.AddToGroupAsync(Context.ConnectionId, GetUserGroupName(ownerId.Value));

            logger.LogInformation(
                "Агент успешно подключён. AgentId: {AgentId}, ConnectionId: {ConnectionId}, Группа: {GroupName}",
                agentId,
                Context.ConnectionId,
                groupName);

            await SendQueuedTasksToCaller(Guid.Parse(agentId), ownerId.Value);
            await base.OnConnectedAsync();
        }
        catch (Exception ex)
        {
            logger.LogError(ex,
                "Ошибка при подключении агента. ConnectionId: {ConnectionId}",
                Context.ConnectionId);

            Context.Abort();
            throw;
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var agentId = GetCurrentAgentId();

        if (!string.IsNullOrWhiteSpace(agentId))
        {
            var groupName = GetAgentGroupName(agentId);
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);

            logger.LogInformation(
                "Агент отключён. AgentId: {AgentId}, ConnectionId: {ConnectionId}, Группа: {GroupName}",
                agentId,
                Context.ConnectionId,
                groupName);
        }
        else
        {
            logger.LogInformation(
                "Отключение неизвестного клиента. ConnectionId: {ConnectionId}",
                Context.ConnectionId);
        }

        await base.OnDisconnectedAsync(exception);
    }

    public async Task Heartbeat(InternalHeartbeatRequest? request = null)
    {
        var agentId = GetCurrentAgentId();
        var userId = GetCurrentUserId();

        if (agentId == null || userId == null)
            return;

        await agentService.HeartbeatInternalAsync(
            Guid.Parse(agentId),
            userId.Value,
            request?.IpAddress,
            request?.Port,
            request?.Distribution,
            Context.ConnectionAborted);
    }

    public async Task SendTaskOutput(Guid taskId, string chunk)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return;

        await taskService.AppendOutputAsync(taskId, userId.Value, chunk, Context.ConnectionAborted);
    }

    public async Task CompleteTask(Guid taskId, string status, string stdout, string stderr, int? exitCode)
    {
        var userId = GetCurrentUserId();
        if (!userId.HasValue)
            return;

        await taskService.CompleteTaskAsync(taskId, userId.Value, status, stdout, stderr, exitCode, Context.ConnectionAborted);
    }

    public Task SendLog(string log)
    {
        var agentId = GetCurrentAgentId();

        if (string.IsNullOrWhiteSpace(agentId))
        {
            logger.LogWarning(
                "Получен лог от неавторизованного клиента. ConnectionId: {ConnectionId}",
                Context.ConnectionId);

            return Task.CompletedTask;
        }

        logger.LogInformation(
            "Лог от агента {AgentId}: {Log}",
            agentId,
            log);

        return Task.CompletedTask;
    }

    private async Task RejectConnection(string message)
    {
        await Clients.Caller.SendAsync("Error", message);
        Context.Abort();
    }

    private static bool TryGetRequiredValue(
        HttpContext httpContext,
        string headerName,
        string queryKey,
        out string value)
    {
        value = string.Empty;

        var headers = httpContext.Request.Headers;
        if (!headers.TryGetValue(headerName, out var headerValues))
        {
            if (!httpContext.Request.Query.TryGetValue(queryKey, out var queryValues))
                return false;

            value = queryValues.ToString();
            return !string.IsNullOrWhiteSpace(value);
        }

        value = headerValues.ToString();
        return !string.IsNullOrWhiteSpace(value);
    }

    private string? GetCurrentAgentId()
    {
        return Context.Items.TryGetValue(AgentIdItemKey, out var value)
            ? value as string
            : null;
    }

    private Guid? GetCurrentUserId()
    {
        return Context.Items.TryGetValue(UserIdItemKey, out var value) && value is Guid parsed
            ? parsed
            : null;
    }

    private async Task SendQueuedTasksToCaller(Guid agentId, Guid userId)
    {
        var queuedTasks = await taskService.GetQueuedTasksAsync(agentId, userId, Context.ConnectionAborted);

        foreach (var task in queuedTasks)
        {
            await Clients.Caller.SendAsync(
                "Command",
                new Application.DTO.AgentCommandDto
                {
                    ExecutionId = task.TaskId,
                    CommandId = Guid.Empty,
                    CommandName = task.Title,
                    Script = task.Command,
                },
                Context.ConnectionAborted);
        }
    }

    public static string GetAgentGroupName(Guid agentId) => $"agent-{agentId}";
    public static string GetAgentGroupName(string agentId) => $"agent-{agentId}";
    public static string GetUserGroupName(Guid userId) => $"user-{userId}";
}
