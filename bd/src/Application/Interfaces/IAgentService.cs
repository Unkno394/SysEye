using Application.DTO;
using Domain.Models;

namespace Application.Interfaces;
public interface IAgentService
{
    Task<Agent> Create(Guid userId, string name, OsType? os, CancellationToken ct);
    Task<bool> DeleteAsync(Guid agentId, Guid userId, CancellationToken ct);
    Task<AgentDto?> Get(Guid agentId, Guid userId, CancellationToken ct);
    Task<PagedResult<AgentDto>> GetUserAgents(Guid userId, int take, int skip, CancellationToken ct);
    Task<DateTime> HeartbeatAsync(Guid agentId, Guid userId, CancellationToken ct);
    Task<AgentDto> RegisterInternalAsync(Guid userId, string apiKey, Guid? agentId, string name, string? ipAddress, int? port, OsType? os, string? distribution, CancellationToken ct);
    Task<DateTime> HeartbeatInternalAsync(Guid agentId, Guid userId, string? ipAddress, int? port, string? distribution, CancellationToken ct);
    Task<bool> Update(Guid agentId, Guid userId, string? name, OsType? os, CancellationToken ct);
}
