using Application.Interfaces;
using Infrastructure.DbContexts;
using Infrastructure.Dto;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Web.Contracts;

namespace Web.Hubs;

public class AgentHub(
    AppDbContext context,
    IApiKeyService apiKeyService,
    IOptions<ApiKeyOptions> options,
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

            var headers = httpContext.Request.Headers;

            if (!TryGetRequiredHeader(headers, options.Value.ApiKeyHeader, out var apiKey))
            {
                logger.LogWarning(
                    "Не найден заголовок API-ключа '{HeaderName}'. ConnectionId: {ConnectionId}",
                    options.Value.ApiKeyHeader,
                    Context.ConnectionId);

                await RejectConnection("Отсутствует API-ключ");
                return;
            }

            if (!TryGetRequiredHeader(headers, options.Value.AgentIdHeader, out var agentId))
            {
                logger.LogWarning(
                    "Не найден заголовок AgentId '{HeaderName}'. ConnectionId: {ConnectionId}",
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

        await agentOtlpSender.SendAsync(agentId, agentLogDto);

        await context.TaskExecutions.Where(t => t.Id == agentLogDto.ExecutionId)
            .ExecuteUpdateAsync(setter => setter
                .SetProperty(p => p.DurationSeconds, agentLogDto.DurationSeconds)
                .SetProperty(p => p.IsSuccess, agentLogDto.Level != "error"));

        await clientHubContext.Clients
            .Group(ClientHub.GetExecutionGroup(agentLogDto.ExecutionId.Value))
            .SendAsync("ExecutionLogReceived", agentLogDto);
    }

    private async Task RejectConnection(string message)
    {
        await Clients.Caller.SendAsync("Error", message);
        Context.Abort();
    }

    private static bool TryGetRequiredHeader(
        IHeaderDictionary headers,
        string headerName,
        out string value)
    {
        value = string.Empty;

        if (!headers.TryGetValue(headerName, out var headerValues))
            return false;

        value = headerValues.ToString();
        return !string.IsNullOrWhiteSpace(value);
    }

    private string? GetCurrentAgentId()
    {
        return Context.Items.TryGetValue(AgentIdItemKey, out var value)
            ? value as string
            : null;
    }

    private static string GetAgentGroupName(string agentId) => $"agent-{agentId}";
}