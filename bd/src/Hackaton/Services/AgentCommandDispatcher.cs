using Application.DTO.Agent;
using Application.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Web.Hubs;

namespace Web.Services;

public class AgentCommandDispatcher(
    IHubContext<AgentHub> hubContext,
    ILogger<AgentCommandDispatcher> logger) : IAgentCommandDispatcher
{
    public async Task SendCommandAsync(
        Guid agentId,
        AgentCommandDto command,
        CancellationToken cancellationToken = default)
    {
        var groupName = $"agent-{agentId}";

        logger.LogInformation(
            "Отправка команды AgentId: {AgentId}, Группа: {GroupName}",
            agentId,
            groupName);

        await hubContext.Clients.Group(groupName)
            .SendAsync("Command", command, cancellationToken);
    }
}