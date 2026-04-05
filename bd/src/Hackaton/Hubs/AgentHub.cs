using System.Text.Json;
using Application.DTO;
using Application.Interfaces;
using Infrastructure.DbContexts;
using Infrastructure.Dto;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Options;
using Web.Contracts;

namespace Web.Hubs;

public class AgentHub(
    IApiKeyService apiKeyService,
    ITaskService taskService,
    IOptions<ApiKeyOptions> options,
    AppDbContext dbContext,
    IAgentOtlpSender agentOtlpSender,
    IHubContext<ClientHub> clientHubContext,
    ILogger<AgentHub> logger) : Hub
{
    private const string AgentIdItemKey = "AgentId";

    public override async Task OnConnectedAsync()
    {
        logger.LogInformation("Начало подключения агента. ConnectionId: {ConnectionId}", Context.ConnectionId);

        try
        {
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

            var isValidApiKey = await apiKeyService.Validate(apiKey);
            if (!isValidApiKey)
            {
                logger.LogWarning(
                    "Неверный API-ключ для агента {AgentId}. ConnectionId: {ConnectionId}",
                    agentId,
                    Context.ConnectionId);

                await RejectConnection("Неверный API-ключ");
                return;
            }

            Context.Items[AgentIdItemKey] = agentId;

            var groupName = GetAgentGroupName(agentId);
            await Groups.AddToGroupAsync(Context.ConnectionId, groupName);

            logger.LogInformation(
                "Агент успешно подключён. AgentId: {AgentId}, ConnectionId: {ConnectionId}, Группа: {GroupName}",
                agentId,
                Context.ConnectionId,
                groupName);

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

    public async Task SendLog(AgentLogDto agentLogDto)
    {
        var agentId = GetCurrentAgentId();

        logger.LogInformation(
            "Лог от агента {AgentId}: {Log}",
            agentId,
            agentLogDto.Message);

        if (string.IsNullOrWhiteSpace(agentId))
            return;

        try
        {
            await agentOtlpSender.SendAsync(agentId, agentLogDto);
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Не удалось отправить лог агента {AgentId} в Loki. Продолжаю без внешнего лог-стрима.",
                agentId);
        }

        if (agentLogDto.ExecutionId.HasValue)
        {
            await clientHubContext.Clients
                .Group(ClientHub.GetExecutionGroup(agentLogDto.ExecutionId.Value))
                .SendAsync("ExecutionLogReceived", agentLogDto);
        }
    }

    public async Task Heartbeat(Dictionary<string, object>? payload)
    {
        var agentId = GetCurrentAgentId();
        if (!Guid.TryParse(agentId, out var parsedAgentId))
            return;

        var agent = await dbContext.Agents.FirstOrDefaultAsync(
            x => x.Id == parsedAgentId && !x.IsDeleted,
            Context.ConnectionAborted);

        if (agent is null)
            return;

        if (TryGetString(payload, "ipAddress", out var ipAddress) && !string.IsNullOrWhiteSpace(ipAddress))
        {
            agent.IpAddress = ipAddress.Trim();
        }

        if (TryGetInt(payload, "port", out var port))
        {
            agent.Port = port;
        }

        if (TryGetString(payload, "distribution", out var distribution) && !string.IsNullOrWhiteSpace(distribution))
        {
            agent.Distribution = distribution.Trim();
        }

        agent.LastHeartbeatAt = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(Context.ConnectionAborted);

        var dto = new AgentDto
        {
            Id = agent.Id,
            Name = agent.Name,
            Os = agent.Os,
            IpAddress = agent.IpAddress,
            Port = agent.Port,
            Distribution = agent.Distribution,
            LastHeartbeatAt = agent.LastHeartbeatAt,
        };

        await clientHubContext.Clients
            .Group(ClientHub.GetUserGroup(agent.UserId.ToString()))
            .SendAsync("AgentUpdated", dto, Context.ConnectionAborted);
    }

    public async Task SendTaskOutput(string taskId, string chunk)
    {
        if (string.IsNullOrWhiteSpace(chunk))
            return;

        var userId = await GetCurrentUserIdAsync();
        if (userId == Guid.Empty || !Guid.TryParse(taskId, out var executionId))
            return;

        await taskService.AppendOutputAsync(
            executionId,
            userId,
            chunk,
            Context.ConnectionAborted);
    }

    public async Task CompleteTask(string taskId, string status, string stdout, string stderr, int? exitCode)
    {
        var userId = await GetCurrentUserIdAsync();
        if (userId == Guid.Empty || !Guid.TryParse(taskId, out var executionId))
            return;

        await taskService.CompleteTaskAsync(
            executionId,
            userId,
            status,
            stdout,
            stderr,
            exitCode,
            Context.ConnectionAborted);
    }

    private async Task RejectConnection(string message)
    {
        await Clients.Caller.SendAsync("Error", message);
        Context.Abort();
    }

    private static bool TryGetRequiredValue(
        HttpContext httpContext,
        string headerName,
        string queryName,
        out string value)
    {
        value = string.Empty;

        if (httpContext.Request.Headers.TryGetValue(headerName, out var headerValues))
        {
            value = headerValues.ToString();
            return !string.IsNullOrWhiteSpace(value);
        }

        if (httpContext.Request.Query.TryGetValue(queryName, out var queryValues))
        {
            value = queryValues.ToString();
            return !string.IsNullOrWhiteSpace(value);
        }

        return false;
    }

    private static bool TryGetString(Dictionary<string, object>? payload, string key, out string value)
    {
        value = string.Empty;

        if (payload is null || !payload.TryGetValue(key, out var rawValue) || rawValue is null)
            return false;

        value = rawValue switch
        {
            string stringValue => stringValue,
            JsonElement { ValueKind: JsonValueKind.String } jsonValue => jsonValue.GetString() ?? string.Empty,
            _ => rawValue.ToString() ?? string.Empty,
        };

        return !string.IsNullOrWhiteSpace(value);
    }

    private static bool TryGetInt(Dictionary<string, object>? payload, string key, out int value)
    {
        value = 0;

        if (payload is null || !payload.TryGetValue(key, out var rawValue) || rawValue is null)
            return false;

        return rawValue switch
        {
            int intValue => (value = intValue) >= 0,
            long longValue when longValue is >= int.MinValue and <= int.MaxValue => (value = (int)longValue) >= 0,
            JsonElement { ValueKind: JsonValueKind.Number } jsonValue when jsonValue.TryGetInt32(out var parsed) => (value = parsed) >= 0,
            string stringValue when int.TryParse(stringValue, out var parsed) => (value = parsed) >= 0,
            _ => false,
        };
    }

    private string? GetCurrentAgentId()
    {
        return Context.Items.TryGetValue(AgentIdItemKey, out var value)
            ? value as string
            : null;
    }

    private async Task<Guid> GetCurrentUserIdAsync()
    {
        var agentId = GetCurrentAgentId();
        if (!Guid.TryParse(agentId, out var parsedAgentId))
            return Guid.Empty;

        return await dbContext.Agents.AsNoTracking()
            .Where(x => x.Id == parsedAgentId && !x.IsDeleted)
            .Select(x => x.UserId)
            .FirstOrDefaultAsync(Context.ConnectionAborted);
    }

    private static string GetAgentGroupName(string agentId) => $"agent-{agentId}";
}
