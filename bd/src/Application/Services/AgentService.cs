using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class AgentService(AppDbContext context, IRealtimeNotifier realtimeNotifier) : IAgentService
{
    private static readonly TimeSpan ManualStatusRefreshWindow = TimeSpan.FromSeconds(45);

    private static readonly Func<AppDbContext, Guid, Guid, IQueryable<Agent>> _getAgentQuery = (ctx, agentId, userId) =>
        ctx.Agents.Where(a => a.Id == agentId && a.UserId == userId && !a.IsDeleted);

    private static AgentDto MapAgentDto(Agent agent) => new()
    {
        Id = agent.Id,
        IpAddress = agent.IpAddress,
        Os = agent.Os,
        Distribution = agent.Distribution,
        LastHeartbeatAt = agent.LastHeartbeatAt,
        Name = agent.Name,
        Port = agent.Port,
    };

    public async Task<Agent> Create(
        Guid userId,
        string name,
        OsType? os,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BadRequestException("Имя агента не может быть пустым");

        var agent = new Agent
        {
            Name = name.Trim(),
            Os = os,
            UserId = userId,
            LastHeartbeatAt = DateTime.UtcNow
        };

        context.Agents.Add(agent);
        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, MapAgentDto(agent), ct);
        return agent;
    }

    public async Task<AgentDto?> Get(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId)
            .AsNoTracking()
            .Select(a => new AgentDto
            {
                Id = a.Id,
                IpAddress = a.IpAddress,
                Os = a.Os,
                Distribution = a.Distribution,
                LastHeartbeatAt = a.LastHeartbeatAt,
                Name = a.Name,
                Port = a.Port,
            })
            .FirstOrDefaultAsync(ct);

        if (agent == null) throw new NotFoundException("Агент не существует");

        return agent;
    }

    public async Task<PagedResult<AgentDto>> GetUserAgents(Guid userId, int take, int skip, CancellationToken ct)
    {
        var items = await context.Agents
            .Where(a => a.UserId == userId && !a.IsDeleted)
            .OrderByDescending(a => a.LastHeartbeatAt)
            .Skip(skip)
            .Take(take)
            .Select(a => new AgentDto
            {
                Id = a.Id,
                IpAddress = a.IpAddress,
                Os = a.Os,
                Distribution = a.Distribution,
                LastHeartbeatAt = a.LastHeartbeatAt,
                Name = a.Name,
                Port = a.Port,
            })
            .ToListAsync(ct);

        var count = await context.Agents
             .Where(a => a.UserId == userId && !a.IsDeleted)
             .CountAsync(ct);

        return new PagedResult<AgentDto>
        {
            Items = items,
            Skip = skip,
            Take = take,
            TotalCount = count
        };
    }

    public async Task<bool> Update(
        Guid agentId,
        Guid userId,
        string? name,
        string? ipAddress,
        OsType? os,
        CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        if (!string.IsNullOrWhiteSpace(name))
            agent.Name = name.Trim();

        if (ipAddress != null)
            agent.IpAddress = ipAddress.Trim();

        if (os != null)
            agent.Os = os.Value;

        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, MapAgentDto(agent), ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        agent.IsDeleted = true;
        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentDeletedAsync(userId, agentId, ct);
        return true;
    }

    public async Task<DateTime> HeartbeatAsync(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        if (agent.LastHeartbeatAt < DateTime.UtcNow.Subtract(ManualStatusRefreshWindow))
            throw new BadRequestException("Агент сейчас оффлайн. Кнопка не переводит машину в online без реального heartbeat от самого агента.");

        return agent.LastHeartbeatAt;
    }

    public async Task<DateTime> HeartbeatInternalAsync(Guid agentId, Guid userId, string? ipAddress, int? port, string? distribution, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        agent.LastHeartbeatAt = DateTime.UtcNow;

        if (ipAddress != null)
            agent.IpAddress = ipAddress.Trim();

        if (port.HasValue)
            agent.Port = port.Value;

        if (distribution != null)
            agent.Distribution = distribution.Trim();

        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, MapAgentDto(agent), ct);
        return agent.LastHeartbeatAt;
    }

    public async Task<AgentDto> RegisterInternalAsync(
        Guid userId,
        Guid? agentId,
        string name,
        string? ipAddress,
        int? port,
        OsType? os,
        string? distribution,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BadRequestException("Имя агента не может быть пустым");

        Agent? agent = null;

        if (agentId.HasValue)
        {
            agent = await _getAgentQuery(context, agentId.Value, userId).FirstOrDefaultAsync(ct);
        }

        if (agent == null)
        {
            agent = new Agent
            {
                UserId = userId,
                Name = name.Trim(),
                IpAddress = ipAddress?.Trim(),
                Port = port,
                Os = os,
                Distribution = distribution?.Trim(),
                LastHeartbeatAt = DateTime.UtcNow,
            };

            context.Agents.Add(agent);
        }
        else
        {
            agent.Name = name.Trim();
            agent.IpAddress = ipAddress?.Trim();
            agent.Port = port;
            agent.Os = os;
            agent.Distribution = distribution?.Trim();
            agent.LastHeartbeatAt = DateTime.UtcNow;
        }

        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, MapAgentDto(agent), ct);
        return MapAgentDto(agent);
    }
}
