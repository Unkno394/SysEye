using Application.DTO;

namespace Application.Interfaces;

public interface IAgentCommandDispatcher
{
    Task SendCommandAsync(Guid agentId, AgentCommandDto command, CancellationToken cancellationToken = default);
    Task CancelTaskAsync(Guid agentId, Guid taskId, CancellationToken cancellationToken = default);
}
