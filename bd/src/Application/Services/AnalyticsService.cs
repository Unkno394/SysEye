using Application.DTO.Analytics;
using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class AnalyticsService(AppDbContext dbContext) : IAnalyticsService
{
    public async Task<IReadOnlyCollection<AgentAnalyticsDto>> GetAgentAnalytics(Guid userId, CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;

        return await dbContext.TaskExecutions.AsNoTracking()
            .Where(x => x.Agent.UserId == userId)
            .GroupBy(x => new { x.AgentId, x.Agent.Name })
            .Select(g => new AgentAnalyticsDto
            {
                AgentId = g.Key.AgentId,
                AgentName = g.Key.Name,

                Total = new AnalyticsDto
                {
                    Executions = g.Count(),
                    Errors = g.Count(x => !x.IsSuccess),
                    SuccessRate = g.Count() == 0
                        ? 0
                        : (double)g.Count(x => x.IsSuccess) / g.Count() * 100,
                    AverageDurationSeconds = g.Average(x => x.DurationSeconds),
                    MinDurationSeconds = g.Min(x => x.DurationSeconds),
                    MaxDurationSeconds = g.Max(x => x.DurationSeconds)
                },

                Today = new AnalyticsDto
                {
                    Executions = g.Count(x => x.StartedAt >= today),
                    Errors = g.Count(x => x.StartedAt >= today && !x.IsSuccess),
                    SuccessRate = g.Count(x => x.StartedAt >= today) == 0
                        ? 0
                        : (double)g.Count(x => x.StartedAt >= today && x.IsSuccess)
                            / g.Count(x => x.StartedAt >= today) * 100,
                    AverageDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Average(x => (double?)x.DurationSeconds) ?? 0,
                    MinDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Min(x => (double?)x.DurationSeconds) ?? 0,
                    MaxDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Max(x => (double?)x.DurationSeconds) ?? 0
                }
            })
            .OrderByDescending(x => x.Total.Executions)
            .ToListAsync(ct);
    }

    public async Task<AgentAnalyticsDto> GetAgentAnalyticsById(Guid userId, Guid agentId, CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;

        var result = await dbContext.TaskExecutions.AsNoTracking()
            .Where(x => x.Agent.UserId == userId && x.AgentId == agentId)
            .GroupBy(x => new { x.AgentId, x.Agent.Name })
            .Select(g => new AgentAnalyticsDto
            {
                AgentId = g.Key.AgentId,
                AgentName = g.Key.Name,

                Total = new AnalyticsDto
                {
                    Executions = g.Count(),
                    Errors = g.Count(x => !x.IsSuccess),
                    SuccessRate = g.Count() == 0
                        ? 0
                        : (double)g.Count(x => x.IsSuccess) / g.Count() * 100,
                    AverageDurationSeconds = g.Average(x => x.DurationSeconds),
                    MinDurationSeconds = g.Min(x => x.DurationSeconds),
                    MaxDurationSeconds = g.Max(x => x.DurationSeconds)
                },

                Today = new AnalyticsDto
                {
                    Executions = g.Count(x => x.StartedAt >= today),
                    Errors = g.Count(x => x.StartedAt >= today && !x.IsSuccess),
                    SuccessRate = g.Count(x => x.StartedAt >= today) == 0
                        ? 0
                        : (double)g.Count(x => x.StartedAt >= today && x.IsSuccess)
                            / g.Count(x => x.StartedAt >= today) * 100,
                    AverageDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Average(x => (double?)x.DurationSeconds) ?? 0,
                    MinDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Min(x => (double?)x.DurationSeconds) ?? 0,
                    MaxDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Max(x => (double?)x.DurationSeconds) ?? 0
                }
            })
            .FirstOrDefaultAsync(ct);

        if (result is not null)
            return result;

        var agentExists = await dbContext.Agents.AsNoTracking()
            .AnyAsync(x => x.Id == agentId && x.UserId == userId && !x.IsDeleted, ct);

        if (!agentExists) throw new NotFoundException("Агент не найден");

        return new AgentAnalyticsDto
        {
            AgentId = agentId,
            AgentName = await dbContext.Agents.AsNoTracking()
                .Where(x => x.Id == agentId)
                .Select(x => x.Name)
                .FirstAsync(ct),
            Total = new AnalyticsDto(),
            Today = new AnalyticsDto()
        };
    }

    public async Task<IReadOnlyCollection<CommandAnalyticsDto>> GetCommandAnalytics(Guid userId, CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;

        return await dbContext.TaskExecutions.AsNoTracking()
            .Where(x => x.Command.UserId == userId)
            .GroupBy(x => new { x.CommandId, x.Command.Name })
            .Select(g => new CommandAnalyticsDto
            {
                CommandId = g.Key.CommandId,
                CommandName = g.Key.Name,

                Total = new AnalyticsDto
                {
                    Executions = g.Count(),
                    Errors = g.Count(x => !x.IsSuccess),
                    SuccessRate = g.Count() == 0
                        ? 0
                        : (double)g.Count(x => x.IsSuccess) / g.Count() * 100,
                    AverageDurationSeconds = g.Average(x => x.DurationSeconds),
                    MinDurationSeconds = g.Min(x => x.DurationSeconds),
                    MaxDurationSeconds = g.Max(x => x.DurationSeconds)
                },

                Today = new AnalyticsDto
                {
                    Executions = g.Count(x => x.StartedAt >= today),
                    Errors = g.Count(x => x.StartedAt >= today && !x.IsSuccess),
                    SuccessRate = g.Count(x => x.StartedAt >= today) == 0
                        ? 0
                        : (double)g.Count(x => x.StartedAt >= today && x.IsSuccess)
                            / g.Count(x => x.StartedAt >= today) * 100,
                    AverageDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Average(x => (double?)x.DurationSeconds) ?? 0,
                    MinDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Min(x => (double?)x.DurationSeconds) ?? 0,
                    MaxDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Max(x => (double?)x.DurationSeconds) ?? 0
                }
            })
            .OrderByDescending(x => x.Total.Executions)
            .ToListAsync(ct);
    }

    public async Task<CommandAnalyticsDto> GetCommandAnalyticsById(Guid userId, Guid commandId, CancellationToken ct = default)
    {
        var today = DateTime.UtcNow.Date;

        var result = await dbContext.TaskExecutions.AsNoTracking()
            .Where(x => x.Command.UserId == userId && x.CommandId == commandId)
            .GroupBy(x => new { x.CommandId, x.Command.Name })
            .Select(g => new CommandAnalyticsDto
            {
                CommandId = g.Key.CommandId,
                CommandName = g.Key.Name,

                Total = new AnalyticsDto
                {
                    Executions = g.Count(),
                    Errors = g.Count(x => !x.IsSuccess),
                    SuccessRate = g.Count() == 0
                        ? 0
                        : (double)g.Count(x => x.IsSuccess) / g.Count() * 100,
                    AverageDurationSeconds = g.Average(x => x.DurationSeconds),
                    MinDurationSeconds = g.Min(x => x.DurationSeconds),
                    MaxDurationSeconds = g.Max(x => x.DurationSeconds)
                },

                Today = new AnalyticsDto
                {
                    Executions = g.Count(x => x.StartedAt >= today),
                    Errors = g.Count(x => x.StartedAt >= today && !x.IsSuccess),
                    SuccessRate = g.Count(x => x.StartedAt >= today) == 0
                        ? 0
                        : (double)g.Count(x => x.StartedAt >= today && x.IsSuccess)
                            / g.Count(x => x.StartedAt >= today) * 100,
                    AverageDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Average(x => (double?)x.DurationSeconds) ?? 0,
                    MinDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Min(x => (double?)x.DurationSeconds) ?? 0,
                    MaxDurationSeconds = g
                        .Where(x => x.StartedAt >= today)
                        .Max(x => (double?)x.DurationSeconds) ?? 0
                }
            })
            .FirstOrDefaultAsync(ct);

        if (result is not null)
            return result;

        var commandExists = await dbContext.Commands.AsNoTracking()
            .AnyAsync(x => x.Id == commandId && x.UserId == userId && !x.IsDeleted, ct);

        if (!commandExists)
            throw new NotFoundException("Команда не найдена");

        return new CommandAnalyticsDto
        {
            CommandId = commandId,
            CommandName = await dbContext.Commands
                .AsNoTracking()
                .Where(x => x.Id == commandId)
                .Select(x => x.Name)
                .FirstAsync(ct),
            Total = new AnalyticsDto(),
            Today = new AnalyticsDto()
        };
    }
}