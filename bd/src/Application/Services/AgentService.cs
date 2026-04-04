using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class AgentService(
    AppDbContext context,
    IRealtimeNotifier realtimeNotifier) : IAgentService
{
    private static readonly TimeSpan ManualStatusRefreshWindow = TimeSpan.FromSeconds(45);

    private static readonly Func<AppDbContext, Guid, Guid, IQueryable<Agent>> _getAgentQuery = (ctx, agentId, userId) =>
        ctx.Agents.Where(a => a.Id == agentId && a.UserId == userId && !a.IsDeleted);

    private static readonly Func<Agent, AgentDto> _mapAgent = agent => new AgentDto
    {
        Id = agent.Id,
        Os = agent.Os,
        IpAddress = agent.IpAddress,
        Port = agent.Port,
        Distribution = agent.Distribution,
        LastHeartbeatAt = agent.LastHeartbeatAt,
        Name = agent.Name,
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
            LastHeartbeatAt = DateTime.UtcNow.AddMinutes(-1)
        };

        context.Agents.Add(agent);
        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, _mapAgent(agent), ct);
        return agent;
    }

    public async Task<AgentDto?> Get(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId)
            .AsNoTracking()
            .Select(a => new AgentDto
            {
                Id = a.Id,
                Os = a.Os,
                IpAddress = a.IpAddress,
                Port = a.Port,
                Distribution = a.Distribution,
                LastHeartbeatAt = a.LastHeartbeatAt,
                Name = a.Name,
            })
            .FirstOrDefaultAsync(ct);

        if (agent == null) throw new NotFoundException("Агент не существует");

        return agent;
    }

    public async Task<PagedResult<AgentDto>> GetUserAgents(Guid userId, int take, int skip, CancellationToken ct)
    {
        var query = context.Agents.AsNoTracking()
            .Where(a => a.UserId == userId && !a.IsDeleted);

        var items = await query.OrderByDescending(a => a.LastHeartbeatAt)
            .Skip(skip)
            .Take(take)
            .Select(a => new AgentDto
            {
                Id = a.Id,
                Os = a.Os,
                IpAddress = a.IpAddress,
                Port = a.Port,
                Distribution = a.Distribution,
                LastHeartbeatAt = a.LastHeartbeatAt,
                Name = a.Name,
            })
            .ToListAsync(ct);

        var count = await query.CountAsync(ct);

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
        OsType? os,
        CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        if (!string.IsNullOrWhiteSpace(name))
            agent.Name = name.Trim();

        if (os != null)
            agent.Os = os.Value;

        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, _mapAgent(agent), ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        agent.IsDeleted = true;
        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentDeletedAsync(userId, agent.Id, ct);
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

    public async Task<AgentDto> RegisterInternalAsync(
        Guid userId,
        string apiKey,
        Guid? agentId,
        string name,
        string? ipAddress,
        int? port,
        OsType? os,
        string? distribution,
        CancellationToken ct)
    {
        var resolvedName = string.IsNullOrWhiteSpace(name) ? "Agent" : name.Trim();
        var now = DateTime.UtcNow;

        Agent? agent = null;

        if (agentId.HasValue)
        {
            agent = await context.Agents.FirstOrDefaultAsync(
                a => a.Id == agentId.Value && a.UserId == userId && !a.IsDeleted,
                ct);
        }

        if (agent is null)
        {
            agent = new Agent
            {
                Id = agentId ?? Guid.NewGuid(),
                UserId = userId,
                Name = resolvedName,
                Os = os,
                IpAddress = ipAddress,
                Port = port,
                Distribution = distribution,
                LastHeartbeatAt = now,
            };

            context.Agents.Add(agent);
        }
        else
        {
            agent.Name = resolvedName;
            if (os.HasValue)
            {
                agent.Os = os.Value;
            }

            if (!string.IsNullOrWhiteSpace(ipAddress))
            {
                agent.IpAddress = ipAddress.Trim();
            }

            if (port.HasValue)
            {
                agent.Port = port.Value;
            }

            if (!string.IsNullOrWhiteSpace(distribution))
            {
                agent.Distribution = distribution.Trim();
            }

            agent.LastHeartbeatAt = now;
        }

        await context.SaveChangesAsync(ct);
        var dto = _mapAgent(agent);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, dto, ct);
        return dto;
    }

    public async Task<DateTime> HeartbeatInternalAsync(
        Guid agentId,
        Guid userId,
        string? ipAddress,
        int? port,
        string? distribution,
        CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        if (!string.IsNullOrWhiteSpace(ipAddress))
        {
            agent.IpAddress = ipAddress.Trim();
        }

        if (port.HasValue)
        {
            agent.Port = port.Value;
        }

        if (!string.IsNullOrWhiteSpace(distribution))
        {
            agent.Distribution = distribution.Trim();
        }

        agent.LastHeartbeatAt = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);
        await realtimeNotifier.NotifyAgentUpdatedAsync(userId, _mapAgent(agent), ct);
        return agent.LastHeartbeatAt;
    }
}
