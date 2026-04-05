using Application.DTO;
using Application.DTO.Agent;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class AgentService(AppDbContext context) : IAgentService
{
    private static readonly Func<AppDbContext, Guid, Guid, IQueryable<Agent>> _getAgentQuery = (ctx, agentId, userId) =>
        ctx.Agents.Where(a => a.Id == agentId && a.UserId == userId && !a.IsDeleted);

    public async Task<Agent> Create(
        Guid userId,
        string name,
        OsType? os,
        string? tag,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BadRequestException("Имя агента не может быть пустым");

        var agent = new Agent
        {
            Name = name.Trim(),
            Os = os,
            UserId = userId,
            Tag = tag ?? string.Empty,
        };

        context.Agents.Add(agent);
        await context.SaveChangesAsync(ct);
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
                LastHeartbeatAt = a.LastHeartbeatAt,
                Name = a.Name,
                Tag = a.Tag,
            })
            .FirstOrDefaultAsync(ct);

        if (agent == null) throw new NotFoundException("Агент не существует");

        return agent;
    }

    public async Task<PagedResult<AgentDto>> GetUserAgents(Guid userId, int take, int skip, CancellationToken ct)
    {
        var query = context.Agents.AsNoTracking()
            .Where(a => a.UserId == userId);

        var items = await query.OrderByDescending(a => a.Tag)
            .ThenByDescending(a => a.LastHeartbeatAt)
            .Skip(skip)
            .Take(take)
            .Select(a => new AgentDto
            {
                Id = a.Id,
                Os = a.Os,
                LastHeartbeatAt = a.LastHeartbeatAt,
                Name = a.Name,
                Tag = a.Tag,
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
        string? tag,
        CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        if (!string.IsNullOrWhiteSpace(name))
            agent.Name = name;

        if (!string.IsNullOrWhiteSpace(tag))
            agent.Name = tag;

        if (os != null)
            agent.Os = os.Value;

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        agent.IsDeleted = true;
        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<DateTime> HeartbeatAsync(Guid agentId, Guid userId, CancellationToken ct)
    {
        var agent = await _getAgentQuery(context, agentId, userId).FirstOrDefaultAsync(ct);
        if (agent == null) throw new NotFoundException("Агент не существует");

        agent.LastHeartbeatAt = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);
        return agent.LastHeartbeatAt;
    }
}