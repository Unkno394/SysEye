using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public class TaskService(
    AppDbContext dbContext,
    IAgentCommandDispatcher agentCommandDispatcher,
    IRealtimeNotifier realtimeNotifier,
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
                x.UserId == userId &&
                !x.IsDeleted, cancellationToken);

        if (command is null)
            throw new NotFoundException("Команда не найдена");

        var script = GetScriptByOs(agent.Os, command);
        var renderedScript = ReplacePlaceholders(script, command.Placeholders, request.PlaceholderValues ?? new Dictionary<int, string>());

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

        logger.LogInformation(
            "Команда отправлена агенту. AgentId: {AgentId}, CommandId: {CommandId}, ExecutionId: {ExecutionId}",
            agent.Id,
            command.Id,
            taskExecution.Id);

        return taskExecution.Id;
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

        if (!string.IsNullOrWhiteSpace(chunk))
            task.Output = string.Concat(task.Output, chunk);

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyTaskUpdatedAsync(
            userId,
            task.AgentId,
            MapAgentTaskDto(task),
            cancellationToken);

        logger.LogDebug("Получен chunk выполнения {TaskId}: {Chunk}", taskId, chunk);
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
}
