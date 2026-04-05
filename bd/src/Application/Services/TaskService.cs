using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Infrastructure.Dto;
using Infrastructure.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace Application.Services;

public class TaskService(
    AppDbContext dbContext,
    IAgentCommandDispatcher agentCommandDispatcher,
    IRealtimeNotifier realtimeNotifier,
    IAgentOtlpSender agentOtlpSender,
    ILogger<TaskService> logger) : ITaskService
{
    private const int MaxParallelTasksPerAgent = 3;

    public async Task<Guid> ExecuteCommandAsync(
        Guid userId,
        Guid agentId,
        ExecuteCommandRequest request,
        CancellationToken cancellationToken = default)
    {
        var agent = await dbContext.Agents.AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == agentId &&
                x.UserId == userId &&
                !x.IsDeleted, cancellationToken);

        if (agent is null)
            throw new NotFoundException("Агент не найден");

        var command = await dbContext.Commands.AsNoTracking()
            .Include(x => x.Placeholders)
            .FirstOrDefaultAsync(x =>
                x.Id == request.CommandId &&
                (x.UserId == userId || x.IsSystem) &&
                !x.IsDeleted, cancellationToken);

        if (command is null)
            throw new NotFoundException("Команда не найдена");

        var taskExecution = await QueueCommandInternalAsync(
            userId,
            agent,
            command,
            request.PlaceholderValues ?? new Dictionary<int, string>(),
            cancellationToken);

        logger.LogInformation(
            "Команда отправлена агенту. AgentId: {AgentId}, CommandId: {CommandId}, ExecutionId: {ExecutionId}",
            agent.Id,
            command.Id,
            taskExecution.Id);

        return taskExecution.Id;
    }

    public async Task<IReadOnlyCollection<Guid>> ExecuteScenarioAsync(
        Guid userId,
        Guid agentId,
        Guid scenarioId,
        CancellationToken cancellationToken = default)
    {
        var agent = await dbContext.Agents.AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == agentId &&
                x.UserId == userId &&
                !x.IsDeleted, cancellationToken);

        if (agent is null)
            throw new NotFoundException("Агент не найден");

        var scenario = await dbContext.Scenarios.AsNoTracking()
            .Where(x => x.Id == scenarioId && !x.IsDeleted && (x.UserId == userId || x.IsSystem))
            .Select(x => new
            {
                x.Id,
                x.Name,
                Commands = x.Commands
                    .OrderBy(item => item.Order)
                    .Select(item => item.CommandId)
                    .ToList()
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (scenario is null)
            throw new NotFoundException("Сценарий не найден");

        if (!scenario.Commands.Any())
            throw new BadRequestException("В сценарии нет команд для запуска");

        var commands = await dbContext.Commands.AsNoTracking()
            .Include(x => x.Placeholders)
            .Where(x => scenario.Commands.Contains(x.Id) && (x.UserId == userId || x.IsSystem) && !x.IsDeleted)
            .ToListAsync(cancellationToken);

        var commandMap = commands.ToDictionary(command => command.Id);
        var executionIds = new List<Guid>();

        foreach (var commandId in scenario.Commands)
        {
            if (!commandMap.TryGetValue(commandId, out var command))
                continue;

            if (command.Placeholders.Any())
                throw new BadRequestException($"Команда \"{command.Name}\" требует плейсхолдеры и не может быть запущена через сценарий без параметров");

            var taskExecution = await QueueCommandInternalAsync(
                userId,
                agent,
                command,
                new Dictionary<int, string>(),
                cancellationToken);

            executionIds.Add(taskExecution.Id);
        }

        if (!executionIds.Any())
            throw new BadRequestException("В сценарии нет доступных команд для запуска");

        logger.LogInformation(
            "Сценарий отправлен агенту. AgentId: {AgentId}, ScenarioId: {ScenarioId}, Steps: {Steps}",
            agent.Id,
            scenario.Id,
            executionIds.Count);

        return executionIds;
    }

    public Task<InternalAgentTaskDto?> GetNextQueuedTaskAsync(
        Guid agentId,
        Guid userId,
        CancellationToken cancellationToken = default)
        => GetNextQueuedTaskInternalAsync(agentId, userId, cancellationToken);

    public async Task AppendOutputAsync(
        Guid taskId,
        Guid userId,
        string chunk,
        CancellationToken cancellationToken = default)
    {
        var task = await dbContext.AgentTasks
            .FirstOrDefaultAsync(
                x => x.Id == taskId && x.UserId == userId && !x.IsDeleted,
                cancellationToken);

        if (task is null)
            throw new NotFoundException("Выполнение не найдено");

        if (task.StartedAt is null)
            task.StartedAt = DateTime.UtcNow;

        if (task.Status is "queued" or "sent")
            task.Status = "running";

        var parsedChunk = ParseChunk(chunk);

        if (!string.IsNullOrWhiteSpace(parsedChunk.Message))
        {
            if (parsedChunk.Category == "stderr")
                task.Error = AppendChunk(task.Error, parsedChunk.Message);
            else
                task.Output = AppendChunk(task.Output, parsedChunk.Message);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        await PublishExecutionLogAsync(task, parsedChunk.Message, parsedChunk.Level, parsedChunk.Category, cancellationToken);
        await realtimeNotifier.NotifyTaskUpdatedAsync(
            userId,
            task.AgentId,
            MapAgentTaskDto(task),
            cancellationToken);

        logger.LogDebug("Получен chunk выполнения {TaskId}: {Chunk}", taskId, chunk);
    }

    public async Task CancelTaskAsync(
        Guid taskId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var taskExecution = await dbContext.AgentTasks
            .FirstOrDefaultAsync(
                x => x.Id == taskId && x.UserId == userId && !x.IsDeleted,
                cancellationToken);

        if (taskExecution is null)
            throw new NotFoundException("Выполнение не найдено");

        var currentStatus = NormalizeStatus(taskExecution.Status);
        if (currentStatus is "success" or "error" or "cancelled" or "interrupted")
            return;

        taskExecution.Status = "cancelled";
        taskExecution.StartedAt ??= taskExecution.CreatedAt;
        taskExecution.FinishedAt ??= DateTime.UtcNow;
        taskExecution.Error = AppendChunk(taskExecution.Error, "command cancelled by user");

        await dbContext.SaveChangesAsync(cancellationToken);

        await realtimeNotifier.NotifyTaskUpdatedAsync(
            userId,
            taskExecution.AgentId,
            MapAgentTaskDto(taskExecution),
            cancellationToken);

        await PublishExecutionLogAsync(
            taskExecution,
            "status=cancelled; exitCode=-1",
            "Warning",
            "completion",
            cancellationToken);

        try
        {
            await agentCommandDispatcher.CancelTaskAsync(
                taskExecution.AgentId,
                taskExecution.Id,
                cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Не удалось отправить отмену на агент. TaskId: {TaskId}, AgentId: {AgentId}",
                taskExecution.Id,
                taskExecution.AgentId);
        }

        logger.LogInformation(
            "Запрошена отмена выполнения. TaskId: {TaskId}, AgentId: {AgentId}",
            taskExecution.Id,
            taskExecution.AgentId);
    }

    public async Task CompleteTaskAsync(
        Guid taskId,
        Guid userId,
        string status,
        string stdout,
        string stderr,
        int? exitCode,
        CancellationToken cancellationToken = default)
    {
        var taskExecution = await dbContext.AgentTasks
            .FirstOrDefaultAsync(
                x => x.Id == taskId && x.UserId == userId && !x.IsDeleted,
                cancellationToken);

        if (taskExecution is null)
            throw new NotFoundException("Выполнение не найдено");

        var normalizedStatus = NormalizeStatus(status);
        var completedAt = DateTime.UtcNow;
        var startedAt = taskExecution.StartedAt ?? taskExecution.CreatedAt;
        var hadLiveOutput =
            !string.IsNullOrWhiteSpace(taskExecution.Output) ||
            !string.IsNullOrWhiteSpace(taskExecution.Error);

        taskExecution.Status = normalizedStatus;
        taskExecution.StartedAt ??= startedAt;
        taskExecution.FinishedAt = completedAt;
        taskExecution.ExitCode = exitCode;
        taskExecution.Output = stdout ?? string.Empty;
        taskExecution.Error = stderr ?? string.Empty;

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyTaskUpdatedAsync(
            userId,
            taskExecution.AgentId,
            MapAgentTaskDto(taskExecution),
            cancellationToken);

        if (!hadLiveOutput)
        {
            await PublishBufferedOutputAsync(taskExecution, stdout, "Information", "stdout", cancellationToken);
            await PublishBufferedOutputAsync(taskExecution, stderr, "Error", "stderr", cancellationToken);
        }

        await PublishExecutionLogAsync(
            taskExecution,
            $"status={normalizedStatus}; exitCode={(exitCode.HasValue ? exitCode.Value : -1)}",
            normalizedStatus is "error" or "cancelled" or "interrupted" ? "Warning" : "Information",
            "completion",
            cancellationToken);

        logger.LogInformation(
            "Агент завершил выполнение. TaskId: {TaskId}, Status: {Status}, ExitCode: {ExitCode}",
            taskId,
            normalizedStatus,
            exitCode);
    }

    public async Task<PagedResult<TaskExecutionDto>> GetTasksByAgent(
        Guid userId,
        Guid agentId,
        int take,
        int skip,
        CancellationToken cancellationToken = default)
    {
        var agent = await dbContext.Agents.AsNoTracking()
            .AnyAsync(x => x.Id == agentId &&
                           x.UserId == userId &&
                           !x.IsDeleted,
                           cancellationToken);

        if (!agent) throw new NotFoundException("Агент не найден");

        var query = dbContext.AgentTasks.AsNoTracking()
            .Where(x => x.AgentId == agentId && x.UserId == userId && !x.IsDeleted);

        var count = await query.CountAsync(cancellationToken);

        var rawTasks = await query
            .OrderByDescending(x => x.CreatedAt)
            .Select(t => new
            {
                Id = t.Id,
                t.AgentId,
                t.CommandId,
                t.Title,
                t.CreatedAt,
                t.StartedAt,
                t.FinishedAt,
                t.Status,
                t.ExitCode,
                t.Output,
                t.Error,
            })
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

        var tasks = rawTasks.Select(t => new TaskExecutionDto
        {
            Id = t.Id,
            CommandId = t.CommandId ?? Guid.Empty,
            AgentId = t.AgentId,
            Title = t.Title,
            StartedAt = t.StartedAt ?? t.CreatedAt,
            Status = NormalizeStatus(t.Status),
            CompletedAt = t.FinishedAt,
            DurationSeconds = t.FinishedAt.HasValue
                ? Math.Max(0, (t.FinishedAt.Value - (t.StartedAt ?? t.CreatedAt)).TotalSeconds)
                : null,
            ExitCode = t.ExitCode,
            ResultSummary = BuildResultSummary(
                NormalizeStatus(t.Status),
                t.Output,
                t.Error,
                t.ExitCode),
            RawOutput = t.Output,
            RawError = t.Error,
        }).ToList();

        return new PagedResult<TaskExecutionDto>
        {
            Items = tasks,
            TotalCount = count,
            Skip = skip,
            Take = take
        };
    }

    public async Task<PagedResult<TaskExecutionDto>> GetTasksByUserAsync(
        Guid userId,
        int take,
        int skip,
        CancellationToken ct = default)
    {
        var agentIds = await dbContext.Agents.AsNoTracking()
            .Where(x => x.UserId == userId && !x.IsDeleted)
            .Select(x => x.Id)
            .ToListAsync(ct);

        if (!agentIds.Any())
            return new PagedResult<TaskExecutionDto>
            {
                Items = new(),
                Skip = skip,
                Take = take,
                TotalCount = 0
            };

        var query = dbContext.AgentTasks.AsNoTracking()
            .Where(x => agentIds.Contains(x.AgentId) && !x.IsDeleted);

        var count = await query.CountAsync(ct);

        var rawTasks = await query
            .OrderByDescending(x => x.CreatedAt)
            .Select(t => new
            {
                Id = t.Id,
                t.AgentId,
                t.CommandId,
                t.Title,
                t.CreatedAt,
                t.StartedAt,
                t.FinishedAt,
                t.Status,
                t.ExitCode,
                t.Output,
                t.Error,
            })
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);

        var tasks = rawTasks.Select(t => new TaskExecutionDto
        {
            Id = t.Id,
            CommandId = t.CommandId ?? Guid.Empty,
            AgentId = t.AgentId,
            Title = t.Title,
            StartedAt = t.StartedAt ?? t.CreatedAt,
            Status = NormalizeStatus(t.Status),
            CompletedAt = t.FinishedAt,
            DurationSeconds = t.FinishedAt.HasValue
                ? Math.Max(0, (t.FinishedAt.Value - (t.StartedAt ?? t.CreatedAt)).TotalSeconds)
                : null,
            ExitCode = t.ExitCode,
            ResultSummary = BuildResultSummary(
                NormalizeStatus(t.Status),
                t.Output,
                t.Error,
                t.ExitCode),
            RawOutput = t.Output,
            RawError = t.Error,
        }).ToList();

        return new PagedResult<TaskExecutionDto>
        {
            Items = tasks,
            TotalCount = count,
            Skip = skip,
            Take = take
        };
    }

    private static string GetScriptByOs(OsType? os, Command command) => os switch
    {
        OsType.Windows => command.PowerShellScript,
        OsType.Linux => command.BashScript,
        _ => throw new BadRequestException("Операционная система агента не поддерживается")
    };

    private static string ReplacePlaceholders(
        string script,
        ICollection<CommandPlaceholder> placeholders,
        Dictionary<int, string> values)
    {
        var result = script;

        foreach (var placeholder in placeholders.OrderBy(x => x.Index))
        {
            if (!values.TryGetValue(placeholder.Index, out var value))
            {
                throw new BadRequestException(
                    $"Не передано значение для плейсхолдера с индексом {placeholder.Index}");
            }

            result = result.Replace($"{{{placeholder.Index}}}", value);
            result = result.Replace($"${placeholder.Index}", value);
        }

        return result;
    }

    private static string NormalizeStatus(string? status)
    {
        if (string.IsNullOrWhiteSpace(status))
            return "error";

        return status.Trim().ToLowerInvariant() switch
        {
            "queued" => "queued",
            "running" => "running",
            "success" => "success",
            "cancelled" => "cancelled",
            "interrupted" => "interrupted",
            "sent" => "sent",
            _ => "error",
        };
    }

    private static ParsedChunk ParseChunk(string? chunk)
    {
        var value = string.IsNullOrWhiteSpace(chunk) ? string.Empty : chunk.TrimEnd();

        if (value.StartsWith("[stderr] ", StringComparison.OrdinalIgnoreCase))
        {
            return new ParsedChunk(
                value["[stderr] ".Length..],
                "Error",
                "stderr");
        }

        return new ParsedChunk(value, "Information", "stdout");
    }

    private static string AppendChunk(string? current, string chunk)
    {
        if (string.IsNullOrWhiteSpace(chunk))
            return current ?? string.Empty;

        if (string.IsNullOrWhiteSpace(current))
            return chunk;

        return $"{current.TrimEnd()}{Environment.NewLine}{chunk}";
    }

    private static IEnumerable<string> SplitLines(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            yield break;

        foreach (var line in value.Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!string.IsNullOrWhiteSpace(line))
                yield return line;
        }
    }

    private async Task PublishBufferedOutputAsync(
        AgentTask task,
        string? value,
        string level,
        string category,
        CancellationToken cancellationToken)
    {
        foreach (var line in SplitLines(value))
        {
            await PublishExecutionLogAsync(task, line, level, category, cancellationToken);
        }
    }

    private async Task PublishExecutionLogAsync(
        AgentTask task,
        string? message,
        string level,
        string category,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(message))
            return;

        var log = new AgentLogDto
        {
            ExecutionId = task.Id,
            CommandId = task.CommandId,
            Message = message.TrimEnd(),
            Level = level,
            Category = category,
            Timestamp = DateTimeOffset.UtcNow,
        };

        try
        {
            await agentOtlpSender.SendAsync(task.AgentId.ToString(), log, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Не удалось отправить execution log в Loki для {TaskId}", task.Id);
        }

        try
        {
            await realtimeNotifier.NotifyExecutionLogAsync(task.Id, log, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Не удалось отправить execution log клиенту для {TaskId}", task.Id);
        }
    }

    private async Task<AgentTask> QueueCommandInternalAsync(
        Guid userId,
        Agent agent,
        Command command,
        Dictionary<int, string> placeholderValues,
        CancellationToken cancellationToken)
    {
        var script = GetScriptByOs(agent.Os, command);
        var renderedScript = ReplacePlaceholders(script, command.Placeholders, placeholderValues);

        var taskExecution = new AgentTask
        {
            Id = Guid.NewGuid(),
            AgentId = agent.Id,
            UserId = userId,
            CommandId = command.Id,
            Title = command.Name,
            Command = renderedScript,
            Status = "queued",
            Output = string.Empty,
            Error = string.Empty,
            CreatedAt = DateTime.UtcNow,
        };

        dbContext.AgentTasks.Add(taskExecution);
        await dbContext.SaveChangesAsync(cancellationToken);

        await realtimeNotifier.NotifyTaskQueuedAsync(
            userId,
            agent.Id,
            MapAgentTaskDto(taskExecution),
            cancellationToken);

        var dto = new AgentCommandDto
        {
            ExecutionId = taskExecution.Id,
            CommandId = command.Id,
            CommandName = command.Name,
            Script = renderedScript,
        };

        await agentCommandDispatcher.SendCommandAsync(agent.Id, dto, cancellationToken);
        return taskExecution;
    }

    private async Task<InternalAgentTaskDto?> GetNextQueuedTaskInternalAsync(
        Guid agentId,
        Guid userId,
        CancellationToken cancellationToken)
    {
        var runningCount = await dbContext.AgentTasks.AsNoTracking()
            .CountAsync(
                x => x.AgentId == agentId
                    && x.UserId == userId
                    && !x.IsDeleted
                    && x.Status == "running",
                cancellationToken);

        if (runningCount >= MaxParallelTasksPerAgent)
            return null;

        var task = await dbContext.AgentTasks
            .Where(x =>
                x.AgentId == agentId
                && x.UserId == userId
                && !x.IsDeleted
                && x.Status == "queued")
            .OrderBy(x => x.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (task is null)
            return null;

        task.Status = "running";
        task.StartedAt = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        await realtimeNotifier.NotifyTaskUpdatedAsync(
            userId,
            agentId,
            MapAgentTaskDto(task),
            cancellationToken);

        return new InternalAgentTaskDto
        {
            TaskId = task.Id,
            TaskType = "command",
            Title = task.Title,
            Command = task.Command,
        };
    }

    private static AgentTaskDto MapAgentTaskDto(AgentTask task)
    {
        return new AgentTaskDto
        {
            Id = task.Id,
            Title = task.Title,
            Status = task.Status,
            Output = task.Output,
            Error = task.Error,
            ExitCode = task.ExitCode,
            CreatedAt = task.CreatedAt,
        };
    }

    private static string BuildResultSummary(
        string status,
        string stdout,
        string stderr,
        int? exitCode)
    {
        var stdoutLine = GetFirstMeaningfulLine(stdout);
        var stderrLine = GetFirstMeaningfulLine(stderr);

        return status switch
        {
            "success" when !string.IsNullOrWhiteSpace(stdoutLine) =>
                TruncateSummary(stdoutLine),
            "success" =>
                "Проверка завершилась успешно.",
            "cancelled" when !string.IsNullOrWhiteSpace(stderrLine) =>
                $"Отменено: {TruncateSummary(stderrLine)}",
            "cancelled" =>
                "Выполнение отменено.",
            "interrupted" when !string.IsNullOrWhiteSpace(stderrLine) =>
                $"Прервано: {TruncateSummary(stderrLine)}",
            "interrupted" =>
                "Выполнение было прервано.",
            "running" =>
                "Команда ещё выполняется.",
            "queued" =>
                "Команда ожидает выполнения.",
            "sent" =>
                "Команда отправлена агенту.",
            _ when !string.IsNullOrWhiteSpace(stderrLine) =>
                $"Ошибка: {TruncateSummary(stderrLine)}",
            _ when !string.IsNullOrWhiteSpace(stdoutLine) =>
                $"Ошибка: {TruncateSummary(stdoutLine)}",
            _ when exitCode.HasValue =>
                $"Команда завершилась с кодом {exitCode.Value}.",
            _ =>
                "Команда завершилась с ошибкой.",
        };
    }

    private static string GetFirstMeaningfulLine(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        return value
            .Split(['\r', '\n'], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .FirstOrDefault(static line => !string.IsNullOrWhiteSpace(line))
            ?? string.Empty;
    }

    private static string TruncateSummary(string value)
    {
        const int maxLength = 220;
        return value.Length <= maxLength
            ? value
            : $"{value[..(maxLength - 1)]}…";
    }

    private sealed record ParsedChunk(string Message, string Level, string Category);
}
