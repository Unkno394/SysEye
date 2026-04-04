using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public class TaskService(AppDbContext dbContext,
        ILogger<TaskService> logger,
        IAgentCommandDispatcher agentCommandDispatcher,
        IRealtimeNotifier realtimeNotifier) : ITaskService
{
    public async Task<List<AgentTaskDto>> EnqueueScenarioAsync(
        Guid agentId,
        Guid userId,
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
            .Include(x => x.Commands.OrderBy(command => command.Order))
            .ThenInclude(x => x.Command)
            .ThenInclude(x => x.Placeholders)
            .FirstOrDefaultAsync(x =>
                x.Id == scenarioId &&
                x.UserId == userId &&
                !x.IsDeleted, cancellationToken);

        if (scenario is null)
            throw new NotFoundException("Сценарий не найден");

        if (!scenario.Commands.Any())
            throw new BadRequestException("В сценарии пока нет команд");

        var tasks = new List<AgentTask>();

        foreach (var scenarioCommand in scenario.Commands.OrderBy(x => x.Order))
        {
            var command = scenarioCommand.Command;
            if (command == null || command.IsDeleted)
                throw new NotFoundException("Одна из команд сценария недоступна");

            var script = GetScriptByOs(agent.Os, command);
            if (command.Placeholders.Any() || HasPlaceholderTokens(script))
                throw new BadRequestException("Сценарии пока поддерживают только команды без параметров");

            tasks.Add(new AgentTask
            {
                AgentId = agentId,
                UserId = userId,
                Title = $"{scenario.Name} · {command.Name}".Trim(),
                Command = script,
                Status = "queued",
                Output = string.Empty,
                Error = string.Empty,
                CreatedAt = DateTime.UtcNow,
            });
        }

        dbContext.AgentTasks.AddRange(tasks);
        await dbContext.SaveChangesAsync(cancellationToken);

        var mappedTasks = tasks.Select(MapAgentTask).ToList();

        foreach (var task in tasks)
        {
            var mappedTask = MapAgentTask(task);
            await realtimeNotifier.NotifyTaskQueuedAsync(userId, agentId, mappedTask, cancellationToken);
            await agentCommandDispatcher.SendCommandAsync(
                agentId,
                new AgentCommandDto
                {
                    ExecutionId = task.Id,
                    CommandId = Guid.Empty,
                    CommandName = task.Title,
                    Script = task.Command,
                },
                cancellationToken);
        }

        return mappedTasks;
    }

    public async Task<AgentTaskDto> EnqueueCommandAsync(
        Guid agentId,
        Guid userId,
        string title,
        string command,
        CancellationToken cancellationToken = default)
    {
        var agent = await dbContext.Agents.AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == agentId &&
                x.UserId == userId &&
                !x.IsDeleted, cancellationToken);

        if (agent is null)
            throw new NotFoundException("Агент не найден");

        var task = new AgentTask
        {
            AgentId = agentId,
            UserId = userId,
            Title = title.Trim(),
            Command = command,
            Status = "queued",
            Output = string.Empty,
            Error = string.Empty,
            CreatedAt = DateTime.UtcNow,
        };

        dbContext.AgentTasks.Add(task);
        await dbContext.SaveChangesAsync(cancellationToken);

        var mappedTask = MapAgentTask(task);

        await realtimeNotifier.NotifyTaskQueuedAsync(userId, agentId, mappedTask, cancellationToken);
        await agentCommandDispatcher.SendCommandAsync(
            agentId,
            new AgentCommandDto
            {
                ExecutionId = task.Id,
                CommandId = Guid.Empty,
                CommandName = task.Title,
                Script = task.Command,
            },
            cancellationToken);

        return mappedTask;
    }

    public async Task<List<InternalAgentTaskDto>> GetQueuedTasksAsync(
        Guid agentId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        return await dbContext.AgentTasks.AsNoTracking()
            .Where(item => item.AgentId == agentId && item.UserId == userId && item.Status == "queued" && !item.IsDeleted)
            .OrderBy(item => item.CreatedAt)
            .Select(task => new InternalAgentTaskDto
            {
                TaskId = task.Id,
                TaskType = "command",
                Title = task.Title,
                Command = task.Command,
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<PagedResult<AgentTaskDto>> GetAgentTasksAsync(
        Guid agentId,
        Guid userId,
        int take,
        int skip,
        CancellationToken cancellationToken = default)
    {
        var items = await dbContext.AgentTasks.AsNoTracking()
            .Where(task => task.AgentId == agentId && task.UserId == userId && !task.IsDeleted)
            .OrderByDescending(task => task.CreatedAt)
            .Skip(skip)
            .Take(take)
            .Select(task => new AgentTaskDto
            {
                Id = task.Id,
                Title = task.Title,
                Status = task.Status,
                Output = task.Output,
                Error = task.Error,
                ExitCode = task.ExitCode,
                CreatedAt = task.CreatedAt,
            })
            .ToListAsync(cancellationToken);

        var totalCount = await dbContext.AgentTasks.AsNoTracking()
            .Where(task => task.AgentId == agentId && task.UserId == userId && !task.IsDeleted)
            .CountAsync(cancellationToken);

        return new PagedResult<AgentTaskDto>
        {
            Items = items,
            TotalCount = totalCount,
            Skip = skip,
            Take = take,
        };
    }

    public async Task<AgentMetricsDto> GetAgentMetricsAsync(
        Guid agentId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var tasks = await dbContext.AgentTasks.AsNoTracking()
            .Where(task => task.AgentId == agentId && task.UserId == userId && !task.IsDeleted)
            .Select(task => new
            {
                task.Status,
                task.CreatedAt,
                task.StartedAt,
                task.FinishedAt,
            })
            .ToListAsync(cancellationToken);

        var utcToday = DateTime.UtcNow.Date;
        var activityStart = utcToday.AddDays(-6);

        var completedTasks = tasks
            .Where(task => task.StartedAt.HasValue && task.FinishedAt.HasValue)
            .ToList();

        var activityMap = tasks
            .Where(task => task.CreatedAt.Date >= activityStart)
            .GroupBy(task => task.CreatedAt.Date)
            .ToDictionary(
                group => group.Key,
                group =>
                {
                    var completedForDay = group
                        .Where(task => task.StartedAt.HasValue && task.FinishedAt.HasValue)
                        .ToList();

                    return new AgentMetricsPointDto
                    {
                        Date = group.Key,
                        TotalRuns = group.Count(),
                        SuccessRuns = group.Count(task => task.Status == "success"),
                        ErrorRuns = group.Count(task => task.Status == "error"),
                        AverageDurationSeconds = completedForDay.Count != 0
                            ? completedForDay.Average(task => (task.FinishedAt!.Value - task.StartedAt!.Value).TotalSeconds)
                            : 0,
                    };
                });

        var activity = Enumerable.Range(0, 7)
            .Select(offset => utcToday.AddDays(offset - 6))
            .Select(date => activityMap.TryGetValue(date, out var point)
                ? point
                : new AgentMetricsPointDto
                {
                    Date = date,
                    TotalRuns = 0,
                    SuccessRuns = 0,
                    ErrorRuns = 0,
                    AverageDurationSeconds = 0,
                })
            .ToList();

        var successfulRuns = tasks.Count(task => task.Status == "success");
        var failedRuns = tasks.Count(task => task.Status == "error");
        var completedRuns = successfulRuns + failedRuns;

        return new AgentMetricsDto
        {
            AgentId = agentId,
            TotalRuns = tasks.Count,
            SuccessfulRuns = successfulRuns,
            FailedRuns = failedRuns,
            RunningRuns = tasks.Count(task => task.Status == "running"),
            QueuedRuns = tasks.Count(task => task.Status == "queued"),
            RunsToday = tasks.Count(task => task.CreatedAt.Date == utcToday),
            ErrorsToday = tasks.Count(task => task.CreatedAt.Date == utcToday && task.Status == "error"),
            AverageDurationSeconds = completedTasks.Count != 0
                ? completedTasks.Average(task => (task.FinishedAt!.Value - task.StartedAt!.Value).TotalSeconds)
                : 0,
            SuccessRate = completedRuns == 0
                ? 0
                : Math.Round((double)successfulRuns / completedRuns * 100, 1),
            Activity = activity,
        };
    }

    public async Task<InternalAgentTaskDto?> GetNextQueuedTaskAsync(
        Guid agentId,
        Guid userId,
        CancellationToken cancellationToken = default)
    {
        var task = await dbContext.AgentTasks
            .Where(item => item.AgentId == agentId && item.UserId == userId && item.Status == "queued" && !item.IsDeleted)
            .OrderBy(item => item.CreatedAt)
            .FirstOrDefaultAsync(cancellationToken);

        if (task == null)
            return null;

        task.Status = "running";
        task.StartedAt = DateTime.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);

        return new InternalAgentTaskDto
        {
            TaskId = task.Id,
            TaskType = "command",
            Title = task.Title,
            Command = task.Command,
        };
    }

    public async Task AppendOutputAsync(
        Guid taskId,
        Guid userId,
        string chunk,
        CancellationToken cancellationToken = default)
    {
        var task = await dbContext.AgentTasks
            .FirstOrDefaultAsync(item => item.Id == taskId && item.UserId == userId && !item.IsDeleted, cancellationToken);

        if (task == null)
            throw new NotFoundException("Задача не найдена");

        if (task.Status == "queued")
        {
            task.Status = "running";
            task.StartedAt = DateTime.UtcNow;
        }

        task.Output = string.IsNullOrWhiteSpace(task.Output)
            ? chunk
            : $"{task.Output}\n{chunk}";

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyTaskUpdatedAsync(userId, task.AgentId, MapAgentTask(task), cancellationToken);
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
        var task = await dbContext.AgentTasks
            .FirstOrDefaultAsync(item => item.Id == taskId && item.UserId == userId && !item.IsDeleted, cancellationToken);

        if (task == null)
            throw new NotFoundException("Задача не найдена");

        task.Status = status;
        task.Output = string.IsNullOrWhiteSpace(stdout) ? task.Output : stdout;
        task.Error = stderr ?? string.Empty;
        task.ExitCode = exitCode;
        task.FinishedAt = DateTime.UtcNow;

        if (task.StartedAt == null)
            task.StartedAt = task.FinishedAt;

        await dbContext.SaveChangesAsync(cancellationToken);
        await realtimeNotifier.NotifyTaskUpdatedAsync(userId, task.AgentId, MapAgentTask(task), cancellationToken);
    }

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
        var renderedScript = ReplacePlaceholders(script, command.Placeholders, request.PlaceholderValues);
        var queuedTask = await EnqueueCommandAsync(agent.Id, userId, command.Name, renderedScript, cancellationToken);

        logger.LogInformation(
            "Команда поставлена в очередь. AgentId: {AgentId}, CommandId: {CommandId}, ExecutionId: {ExecutionId}",
            agent.Id,
            command.Id,
            queuedTask.Id);

        return queuedTask.Id;
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
        var orderedPlaceholders = placeholders.OrderBy(x => x.Index).ToList();
        var trimmedScript = script.Trim();

        if (IsSinglePlaceholderTemplate(trimmedScript, orderedPlaceholders))
        {
            var placeholder = orderedPlaceholders[0];

            if (!values.TryGetValue(placeholder.Index, out var singleValue))
            {
                throw new BadRequestException(
                    $"Не передано значение для плейсхолдера с индексом {placeholder.Index}");
            }

            var commandName = placeholder.Name?.Trim();
            if (!string.IsNullOrWhiteSpace(commandName))
            {
                return $"{commandName} {singleValue}".Trim();
            }
        }

        var result = script;

        foreach (var placeholder in orderedPlaceholders)
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

    private static bool IsSinglePlaceholderTemplate(string script, IReadOnlyList<CommandPlaceholder> placeholders)
    {
        if (placeholders.Count != 1)
            return false;

        var token = $"${placeholders[0].Index}";
        var braceToken = $"{{{placeholders[0].Index}}}";

        return script == token || script == braceToken;
    }

    private static bool HasPlaceholderTokens(string script)
        => script.Contains("$1") || script.Contains("$2") || script.Contains("$3")
           || script.Contains("{1}") || script.Contains("{2}") || script.Contains("{3}");

    private static AgentTaskDto MapAgentTask(AgentTask task) => new()
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
