using Application.DTO.Agent;

namespace Application.Interfaces;

public interface IAgentCommandDispatcher
{
    Task SendCommandAsync(Guid agentId, AgentCommandDto command, CancellationToken cancellationToken = default);
}
