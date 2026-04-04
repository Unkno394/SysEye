using Infrastructure.Dto;

namespace Infrastructure.Interfaces;

public interface ILokiLogReader
{
    Task<IReadOnlyCollection<AgentLogDto>> GetByAgentAsync(string agentId, int limit = 200, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionAsync(Guid executionId, int limit = 200, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionRegexAsync(Guid executionId, string regex, int limit = 200, CancellationToken cancellationToken = default);
}