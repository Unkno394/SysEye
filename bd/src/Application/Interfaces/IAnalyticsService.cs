using Application.DTO.Analytics;

namespace Application.Interfaces;
public interface IAnalyticsService
{
    Task<IReadOnlyCollection<AgentAnalyticsDto>> GetAgentAnalytics(Guid userId, CancellationToken ct = default);
    Task<AgentAnalyticsDto> GetAgentAnalyticsById(Guid userId, Guid agentId, CancellationToken ct = default);
    Task<IReadOnlyCollection<CommandAnalyticsDto>> GetCommandAnalytics(Guid userId, CancellationToken ct = default);
    Task<CommandAnalyticsDto> GetCommandAnalyticsById(Guid userId, Guid commandId, CancellationToken ct = default);
}