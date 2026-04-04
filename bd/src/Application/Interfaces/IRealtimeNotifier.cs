using Application.DTO;

namespace Application.Interfaces;

public interface IRealtimeNotifier
{
    Task NotifyAgentUpdatedAsync(Guid userId, AgentDto agent, CancellationToken cancellationToken = default);
    Task NotifyAgentDeletedAsync(Guid userId, Guid agentId, CancellationToken cancellationToken = default);
    Task NotifyTaskQueuedAsync(Guid userId, Guid agentId, AgentTaskDto task, CancellationToken cancellationToken = default);
    Task NotifyTaskUpdatedAsync(Guid userId, Guid agentId, AgentTaskDto task, CancellationToken cancellationToken = default);
}
