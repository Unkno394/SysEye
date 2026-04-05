using Application.DTO;

namespace Application.Interfaces;

public interface IAnalyticsService
{
    Task<IReadOnlyCollection<AgentAnalyticsDto>> GetAgentsAnalyticsAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<AgentAnalyticsDto> GetAgentAnalyticsAsync(Guid userId, Guid agentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<CommandAnalyticsDto>> GetCommandsAnalyticsAsync(Guid userId, CancellationToken cancellationToken = default);
    Task<CommandAnalyticsDto> GetCommandAnalyticsAsync(Guid userId, Guid commandId, CancellationToken cancellationToken = default);
    Task<AgentMetricsDto> GetAgentMetricsAsync(Guid userId, Guid agentId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AgentRatingDto>> GetAgentRatingsAsync(Guid userId, CancellationToken cancellationToken = default);
}
