using Infrastructure.Dto;

namespace Application.Interfaces;
public interface IAgentLogsService
{
    Task<IReadOnlyCollection<AgentLogDto>> GetByAgentAsync(Guid userId, Guid agentId, int limit = 200, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionAsync(Guid userId, Guid executionId, int limit = 200, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionRegexAsync(Guid userId, Guid executionId, int limit = 200, CancellationToken cancellationToken = default);
}
