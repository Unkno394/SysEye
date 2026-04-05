using Application.DTO;
using Application.DTO.Agent;
using Domain.Models;

namespace Application.Interfaces;
public interface IAgentService
{
    Task<Agent> Create(Guid userId, string name, OsType? os, string? tag, CancellationToken ct);
    Task<bool> DeleteAsync(Guid agentId, Guid userId, CancellationToken ct);
    Task<AgentDto?> Get(Guid agentId, Guid userId, CancellationToken ct);
    Task<PagedResult<AgentDto>> GetUserAgents(Guid userId, int take, int skip, CancellationToken ct);
    Task<DateTime> HeartbeatAsync(Guid agentId, Guid userId, CancellationToken ct);
    Task<bool> Update(Guid agentId, Guid userId, string? name, OsType? os, string? tag, CancellationToken ct);
}