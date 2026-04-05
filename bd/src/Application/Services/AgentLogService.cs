using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Infrastructure.Dto;
using Infrastructure.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Text.RegularExpressions;

namespace Infrastructure.Services;

public sealed class AgentLogsService(
    AppDbContext dbContext,
    ILokiLogReader lokiLogReader,
    ILogger<AgentLogsService> logger) : IAgentLogsService
{
    public async Task<IReadOnlyCollection<AgentLogDto>> GetByAgentAsync(
        Guid userId,
        Guid agentId,
        int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var agentExists = await dbContext.Agents.AsNoTracking()
            .AnyAsync(x => x.Id == agentId
                && x.UserId == userId
                && !x.IsDeleted,
                cancellationToken);

        if (!agentExists)
            throw new NotFoundException("Агент не найден");

        try
        {
            return await lokiLogReader.GetByAgentAsync(
                agentId.ToString(),
                limit,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Не удалось получить agent logs из Loki для {AgentId}. Использую fallback из БД.", agentId);

            var tasks = await dbContext.AgentTasks.AsNoTracking()
                .Where(x => x.AgentId == agentId && x.UserId == userId && !x.IsDeleted)
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => new FallbackTaskSnapshot
                {
                    Id = x.Id,
                    CommandId = x.CommandId,
                    CreatedAt = x.CreatedAt,
                    StartedAt = x.StartedAt,
                    FinishedAt = x.FinishedAt,
                    Status = x.Status,
                    ExitCode = x.ExitCode,
                    Output = x.Output,
                    Error = x.Error,
                })
                .Take(Math.Max(1, limit))
                .ToListAsync(cancellationToken);

            return BuildFallbackAgentLogs(tasks, limit);
        }
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionAsync(
        Guid userId,
        Guid executionId,
        int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var execution = await dbContext.AgentTasks.AsNoTracking()
            .Where(x => x.Id == executionId && x.UserId == userId && !x.IsDeleted)
            .Select(x => new
            {
                x.Id,
                x.CommandId,
                x.CreatedAt,
                x.StartedAt,
                x.FinishedAt,
                x.Status,
                x.ExitCode,
                x.Output,
                x.Error,
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (execution is null)
            throw new NotFoundException("Выполнение не найдено");

        try
        {
            return await lokiLogReader.GetByExecutionAsync(
                executionId,
                limit,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Не удалось получить execution logs из Loki для {ExecutionId}. Использую fallback из БД.", executionId);
            return BuildFallbackExecutionLogs(
                execution.Id,
                execution.CommandId,
                execution.StartedAt ?? execution.CreatedAt,
                execution.Output,
                execution.Error,
                execution.Status,
                execution.ExitCode,
                execution.FinishedAt,
                limit);
        }
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionRegexAsync(
        Guid userId,
        Guid executionId,
        int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var execution = await dbContext.AgentTasks
            .AsNoTracking()
            .Where(x => x.Id == executionId && x.UserId == userId && !x.IsDeleted)
            .Select(x => new
            {
                x.Id,
                x.CommandId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (execution is null)
            throw new NotFoundException("Выполнение не найдено");

        if (execution.CommandId is null)
            throw new BadRequestException("Для этого выполнения регулярный фильтр логов недоступен");

        var command = await dbContext.Commands
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == execution.CommandId.Value &&
                (x.UserId == userId || x.IsSystem) &&
                !x.IsDeleted,
                cancellationToken);

        if (command is null)
            throw new NotFoundException("Команда не найдена");

        if (string.IsNullOrWhiteSpace(command.LogRegex))
            throw new BadRequestException("У команды не задан LogRegex");

        try
        {
            return await lokiLogReader.GetByExecutionRegexAsync(
                executionId,
                command.LogRegex,
                limit,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Не удалось получить regex execution logs из Loki для {ExecutionId}. Использую fallback из БД.", executionId);

            var fallbackLogs = await dbContext.AgentTasks.AsNoTracking()
                .Where(x => x.Id == executionId && x.UserId == userId && !x.IsDeleted)
                .Select(x => new FallbackTaskSnapshot
                {
                    Id = x.Id,
                    CommandId = x.CommandId,
                    CreatedAt = x.CreatedAt,
                    StartedAt = x.StartedAt,
                    FinishedAt = x.FinishedAt,
                    Status = x.Status,
                    ExitCode = x.ExitCode,
                    Output = x.Output,
                    Error = x.Error,
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (fallbackLogs is null)
                throw new NotFoundException("Выполнение не найдено");

            return FilterLogsByRegex(
                BuildFallbackExecutionLogs(
                    fallbackLogs.Id,
                    fallbackLogs.CommandId,
                    fallbackLogs.StartedAt ?? fallbackLogs.CreatedAt,
                    fallbackLogs.Output,
                    fallbackLogs.Error,
                    fallbackLogs.Status,
                    fallbackLogs.ExitCode,
                    fallbackLogs.FinishedAt,
                    limit),
                command.LogRegex,
                limit);
        }
    }

    private static IReadOnlyCollection<AgentLogDto> BuildFallbackExecutionLogs(
        Guid executionId,
        Guid? commandId,
        DateTime timestamp,
        string? output,
        string? error,
        string? status,
        int? exitCode,
        DateTime? completedAt,
        int limit)
    {
        var result = new List<AgentLogDto>();
        var baseTimestamp = new DateTimeOffset(DateTime.SpecifyKind(timestamp, DateTimeKind.Utc));

        AppendLines(result, executionId, commandId, baseTimestamp, output, "Information", "stdout");
        AppendLines(result, executionId, commandId, baseTimestamp, error, "Error", "stderr");
        AppendCompletion(result, executionId, commandId, completedAt, status, exitCode);

        return result
            .Take(Math.Max(1, limit))
            .ToArray();
    }

    private static IReadOnlyCollection<AgentLogDto> BuildFallbackAgentLogs(
        IReadOnlyCollection<FallbackTaskSnapshot> tasks,
        int limit)
    {
        var result = new List<AgentLogDto>();

        foreach (var task in tasks)
        {
            result.AddRange(BuildFallbackExecutionLogs(
                task.Id,
                task.CommandId,
                task.StartedAt ?? task.CreatedAt,
                task.Output,
                task.Error,
                task.Status,
                task.ExitCode,
                task.FinishedAt,
                limit));
        }

        return result
            .OrderByDescending(x => x.Timestamp)
            .Take(Math.Max(1, limit))
            .ToArray();
    }

    private static void AppendLines(
        List<AgentLogDto> target,
        Guid executionId,
        Guid? commandId,
        DateTimeOffset timestamp,
        string? value,
        string level,
        string category)
    {
        if (string.IsNullOrWhiteSpace(value))
            return;

        foreach (var line in value.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (string.IsNullOrWhiteSpace(line))
                continue;

            target.Add(new AgentLogDto
            {
                ExecutionId = executionId,
                CommandId = commandId,
                Message = line,
                Level = level,
                Category = category,
                Timestamp = timestamp,
            });
        }
    }

    private static void AppendCompletion(
        List<AgentLogDto> target,
        Guid executionId,
        Guid? commandId,
        DateTime? completedAt,
        string? status,
        int? exitCode)
    {
        var normalizedStatus = string.IsNullOrWhiteSpace(status) ? "unknown" : status.Trim().ToLowerInvariant();

        if (normalizedStatus == "unknown" && exitCode is null && !completedAt.HasValue)
            return;

        var timestamp = completedAt.HasValue
            ? new DateTimeOffset(DateTime.SpecifyKind(completedAt.Value, DateTimeKind.Utc))
            : DateTimeOffset.UtcNow;

        target.Add(new AgentLogDto
        {
            ExecutionId = executionId,
            CommandId = commandId,
            Message = $"status={normalizedStatus}; exitCode={(exitCode.HasValue ? exitCode.Value : -1)}",
            Level = normalizedStatus is "error" or "cancelled" or "interrupted" ? "Warning" : "Information",
            Category = "completion",
            Timestamp = timestamp,
        });
    }

    private sealed class FallbackTaskSnapshot
    {
        public Guid Id { get; init; }
        public Guid? CommandId { get; init; }
        public DateTime CreatedAt { get; init; }
        public DateTime? StartedAt { get; init; }
        public DateTime? FinishedAt { get; init; }
        public string? Status { get; init; }
        public int? ExitCode { get; init; }
        public string? Output { get; init; }
        public string? Error { get; init; }
    }

    private static IReadOnlyCollection<AgentLogDto> FilterLogsByRegex(
        IReadOnlyCollection<AgentLogDto> logs,
        string regex,
        int limit)
    {
        try
        {
            var compiled = new Regex(regex, RegexOptions.Compiled | RegexOptions.IgnoreCase);
            return logs
                .Where(x => compiled.IsMatch(x.Message))
                .Take(Math.Max(1, limit))
                .ToArray();
        }
        catch (Exception ex)
        {
            throw new BadRequestException("Некорректный LogRegex у команды.", ex);
        }
    }
}
