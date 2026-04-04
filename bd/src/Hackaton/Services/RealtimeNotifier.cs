using Application.DTO;
using Application.Interfaces;
using Microsoft.AspNetCore.SignalR;
using Web.Hubs;

namespace Web.Services;

public class RealtimeNotifier(IHubContext<ClientHub> hubContext) : IRealtimeNotifier
{
    public Task NotifyAgentUpdatedAsync(Guid userId, AgentDto agent, CancellationToken cancellationToken = default)
        => hubContext.Clients.Group(ClientHub.GetUserGroup(userId.ToString()))
            .SendAsync("AgentUpdated", agent, cancellationToken);

    public Task NotifyAgentDeletedAsync(Guid userId, Guid agentId, CancellationToken cancellationToken = default)
        => hubContext.Clients.Group(ClientHub.GetUserGroup(userId.ToString()))
            .SendAsync("AgentDeleted", new { agentId }, cancellationToken);

    public Task NotifyTaskQueuedAsync(Guid userId, Guid agentId, AgentTaskDto task, CancellationToken cancellationToken = default)
        => hubContext.Clients.Group(ClientHub.GetUserGroup(userId.ToString()))
            .SendAsync("TaskQueued", new { agentId, task }, cancellationToken);

    public Task NotifyTaskUpdatedAsync(Guid userId, Guid agentId, AgentTaskDto task, CancellationToken cancellationToken = default)
        => hubContext.Clients.Group(ClientHub.GetUserGroup(userId.ToString()))
            .SendAsync("TaskUpdated", new { agentId, task }, cancellationToken);
}
