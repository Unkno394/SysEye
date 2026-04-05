using Application.DTO;
using Application.DTO.Analytics;
using Application.Exporters.Interfaces;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class AnalyticsExportService(
    AppDbContext dbContext,
    IAnalyticsJsonExporter jsonExporter,
    IAnalyticsCsvExporter csvExporter,
    IAnalyticsPdfExporter pdfExporter) : IAnalyticsExportService
{
    public async Task<AnalyticsFullExportDto> GetFullExportAsync(
        Guid userId,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        Guid? agentId = null,
        Guid? commandId = null,
        CancellationToken ct = default)
    {
        ValidateFilter(fromUtc, toUtc);

        if (agentId.HasValue)
        {
            var agentExists = await dbContext.Agents
                .AsNoTracking()
                .AnyAsync(x => x.Id == agentId.Value && x.UserId == userId && !x.IsDeleted, ct);

            if (!agentExists)
                throw new NotFoundException("Агент не найден");
        }

        if (commandId.HasValue)
        {
            var commandExists = await dbContext.Commands
                .AsNoTracking()
                .AnyAsync(x => x.Id == commandId.Value && x.UserId == userId && !x.IsDeleted, ct);

            if (!commandExists)
                throw new NotFoundException("Команда не найдена");
        }

        var baseQuery = BuildBaseQuery(userId, fromUtc, toUtc, agentId, commandId);

        var agentAnalytics = await baseQuery
            .GroupBy(x => new { x.AgentId, x.Agent.Name })
            .Select(g => new AgentAnalyticsTotalDto
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
                }
            })
            .OrderByDescending(x => x.Total.Executions)
            .ToListAsync(ct);

        var commandAnalytics = await baseQuery
            .GroupBy(x => new { x.CommandId, x.Command.Name })
            .Select(g => new CommandAnalyticsTotalDto
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
                }
            })
            .OrderByDescending(x => x.Total.Executions)
            .ToListAsync(ct);

        var taskExecutions = await baseQuery
            .OrderByDescending(x => x.StartedAt)
            .Select(x => new TaskExecutionDto
            {
                Id = x.Id,
                CommandId = x.CommandId,
                AgentId = x.AgentId,
                StartedAt = x.StartedAt,
                DurationSeconds = x.DurationSeconds,
                IsSuccess = x.IsSuccess
            })
            .ToListAsync(ct);

        return new AnalyticsFullExportDto
        {
            ExportedAtUtc = DateTime.UtcNow,
            AgentAnalytics = agentAnalytics,
            CommandAnalytics = commandAnalytics,
            TaskExecutions = taskExecutions
        };
    }

    public async Task<ExportFileDto> ExportAsync(
        Guid userId,
        AnalyticsExportFormat format,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        Guid? agentId = null,
        Guid? commandId = null,
        CancellationToken ct = default)
    {
        var data = await GetFullExportAsync(userId, fromUtc, toUtc, agentId, commandId, ct);

        return format switch
        {
            AnalyticsExportFormat.Json => jsonExporter.Export(data),
            AnalyticsExportFormat.Csv => csvExporter.Export(data),
            AnalyticsExportFormat.Pdf => pdfExporter.Export(data),
            _ => throw new BadRequestException("Неподдерживаемый формат экспорта")
        };
    }

    private IQueryable<TaskExecution> BuildBaseQuery(
        Guid userId,
        DateTime? fromUtc,
        DateTime? toUtc,
        Guid? agentId,
        Guid? commandId)
    {
        var query = dbContext.TaskExecutions
            .AsNoTracking()
            .Where(x => x.Agent.UserId == userId);

        if (fromUtc.HasValue)
            query = query.Where(x => x.StartedAt >= fromUtc.Value);

        if (toUtc.HasValue)
            query = query.Where(x => x.StartedAt <= toUtc.Value);

        if (agentId.HasValue)
            query = query.Where(x => x.AgentId == agentId.Value);

        if (commandId.HasValue)
            query = query.Where(x => x.CommandId == commandId.Value);

        return query;
    }

    private static void ValidateFilter(DateTime? fromUtc, DateTime? toUtc)
    {
        if (fromUtc.HasValue && toUtc.HasValue && fromUtc.Value > toUtc.Value)
            throw new BadRequestException("Дата начала не может быть больше даты окончания");
    }
}