using Application.DTO;
using Application.DTO.Agent;
using Application.DTO.Scenario;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

public class TaskService(
    AppDbContext dbContext,
    IAgentCommandDispatcher agentCommandDispatcher,
    ILogger<TaskService> logger) : ITaskService
{
    public async Task<Guid> ExecuteCommand(
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
                !x.IsDeleted, cancellationToken);

        if (command is null)
            throw new NotFoundException("Команда не найдена");

        var script = GetScriptByOs(agent.Os, command);
        var renderedScript = ReplacePlaceholders(script, command.Placeholders, request.PlaceholderValues);

        var taskExecution = new TaskExecution
        {
            Id = Guid.NewGuid(),
            AgentId = agent.Id,
            CommandId = command.Id,
        };

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

    public async Task<IReadOnlyCollection<Guid>> ExecuteScenario(
    Guid userId,
    Guid agentId,
    Guid scenarioId,
    List<ExecuteScenarioCommandItem> commands,
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
            .Include(x => x.Commands)
                .ThenInclude(x => x.Command)
                    .ThenInclude(x => x.Placeholders)
            .FirstOrDefaultAsync(x =>
                x.Id == scenarioId &&
                !x.IsDeleted, cancellationToken);

        if (scenario is null) throw new NotFoundException("Сценарий не найден");

        var scenarioCommands = scenario.Commands
            .OrderBy(x => x.Order)
            .ToList();

        if (scenarioCommands.Count == 0) throw new BadRequestException("Сценарий не содержит команд");

        if (commands.Count != scenarioCommands.Count)
            throw new BadRequestException("Количество команд в запросе не совпадает со сценарием");

        var executionIds = new List<Guid>(scenarioCommands.Count);

        for (var i = 0; i < scenarioCommands.Count; i++)
        {
            var scenarioCommand = scenarioCommands[i];
            var requestCommand = commands[i];
            var command = scenarioCommand.Command;

            if (requestCommand.CommandId != command.Id)
            {
                throw new BadRequestException(
                    $"Неверный порядок команд в запросе. Ожидалась команда {command.Id}, получена {requestCommand.CommandId}");
            }

            var script = GetScriptByOs(agent.Os, command);
            var renderedScript = ReplacePlaceholders(script, command.Placeholders, requestCommand.PlaceholderValues);

            var taskExecution = new TaskExecution
            {
                Id = Guid.NewGuid(),
                AgentId = agent.Id,
                CommandId = command.Id,
            };

            var dto = new AgentCommandDto
            {
                ExecutionId = taskExecution.Id,
                CommandId = command.Id,
                CommandName = command.Name,
                Script = renderedScript,
            };

            await agentCommandDispatcher.SendCommandAsync(agent.Id, dto, cancellationToken);

            logger.LogInformation(
                "Команда из сценария отправлена агенту. ScenarioId: {ScenarioId}, AgentId: {AgentId}, CommandId: {CommandId}, ExecutionId: {ExecutionId}, Order: {Order}",
                scenario.Id,
                agent.Id,
                command.Id,
                taskExecution.Id,
                scenarioCommand.Order);

            executionIds.Add(taskExecution.Id);
        }

        logger.LogInformation(
            "Сценарий отправлен агенту. ScenarioId: {ScenarioId}, AgentId: {AgentId}, CommandsCount: {CommandsCount}",
            scenario.Id,
            agent.Id,
            scenarioCommands.Count);

        return executionIds;
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

        var query = dbContext.TaskExecutions.AsNoTracking()
            .Include(x => x.Command)
            .Where(x => x.AgentId == agentId);

        var count = await query.CountAsync(cancellationToken);

        var tasks = await query.OrderByDescending(x => x.StartedAt)
            .Select(t => new TaskExecutionDto
            {
                Id = t.Id,
                CommandId = t.CommandId,
                AgentId = t.AgentId,
                StartedAt = t.StartedAt,
                DurationSeconds = t.DurationSeconds,
                IsSuccess = t.IsSuccess
            })
            .Skip(skip)
            .Take(take)
            .ToListAsync(cancellationToken);

        return new PagedResult<TaskExecutionDto>
        {
            Items = tasks,
            TotalCount = count,
            Skip = skip,
            Take = take
        };
    }

    public async Task<PagedResult<TaskExecutionDto>> GetTasksByUser(
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

        var query = dbContext.TaskExecutions.AsNoTracking()
            .Include(x => x.Command)
            .Include(x => x.Agent)
            .Where(x => agentIds.Contains(x.AgentId));

        var count = await query.CountAsync(ct);

        var tasks = await query.OrderByDescending(x => x.StartedAt)
            .Select(t => new TaskExecutionDto
            {
                Id = t.Id,
                CommandId = t.CommandId,
                AgentId = t.AgentId,
                StartedAt = t.StartedAt
            })
            .Skip(skip)
            .Take(take)
            .ToListAsync(ct);

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
        }

        return result;
    }
}