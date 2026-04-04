namespace Application.Services;

using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

public class ScenarioService(AppDbContext context) : IScenarioService
{
    private static readonly Func<AppDbContext, Guid, Guid, IQueryable<Scenario>> _getScenarioQuery
        = (context, scenarioId, userId) => context.Scenarios
            .Where(x => x.Id == scenarioId && !x.IsDeleted && (x.UserId == userId || x.IsSystem));

    public async Task<Scenario> CreateAsync(
        Guid userId,
        string name,
        string description,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BadRequestException("Название сценария не может быть пустым");

        var scenario = new Scenario
        {
            UserId = userId,
            Name = name.Trim(),
            Description = description ?? string.Empty
        };

        context.Scenarios.Add(scenario);
        await context.SaveChangesAsync(ct);

        return scenario;
    }

    public async Task<bool> UpdateAsync(
        Guid scenarioId,
        Guid userId,
        string? name,
        string? description,
        CancellationToken ct)
    {
        var scenario = await _getScenarioQuery(context, scenarioId, userId)
            .Where(x => !x.IsSystem)
            .FirstOrDefaultAsync(ct);

        if (scenario is null)
            throw new NotFoundException("Сценарий не существует");

        if (!string.IsNullOrWhiteSpace(name))
            scenario.Name = name.Trim();

        if (description != null)
            scenario.Description = description;

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(
        Guid scenarioId,
        Guid userId,
        CancellationToken ct)
    {
        var updated = await _getScenarioQuery(context, scenarioId, userId)
            .Where(x => !x.IsSystem)
            .ExecuteUpdateAsync(setters => setters
                .SetProperty(x => x.IsDeleted, true), ct);

        if (updated == 0)
            throw new NotFoundException("Сценарий не существует");

        return true;
    }

    public async Task<PagedResult<ScenarioDto>> GetUserScenariosAsync(
        Guid userId,
        int take,
        int skip,
        CancellationToken ct)
    {
        var items = await context.Scenarios
            .Where(x => !x.IsDeleted && (x.UserId == userId || x.IsSystem))
            .OrderByDescending(x => x.IsSystem)
            .ThenBy(x => x.Name)
            .Skip(skip)
            .Take(take)
            .Select(x => new ScenarioDto
            {
                Id = x.Id,
                Name = x.Name,
                Description = x.Description,
                IsSystem = x.IsSystem
            })
            .ToListAsync(ct);

        var totalCount = await context.Scenarios
            .Where(x => !x.IsDeleted && (x.UserId == userId || x.IsSystem))
            .CountAsync(ct);

        return new PagedResult<ScenarioDto>
        {
            Items = items,
            TotalCount = totalCount,
            Skip = skip,
            Take = take
        };
    }

    public async Task<ScenarioDetailsDto> GetByIdAsync(
        Guid scenarioId,
        Guid userId,
        CancellationToken ct)
    {
        var scenario = await context.Scenarios
            .Where(x => x.Id == scenarioId && !x.IsDeleted && (x.UserId == userId || x.IsSystem))
            .Select(x => new ScenarioDetailsDto
            {
                Id = x.Id,
                Name = x.Name,
                Description = x.Description,
                IsSystem = x.IsSystem,
                Commands = x.Commands
                    .OrderBy(c => c.Order)
                    .Select(c => new ScenarioCommandDto
                    {
                        CommandId = c.CommandId,
                        CommandName = c.Command.Name,
                        Order = c.Order
                    })
                    .ToList()
            })
            .FirstOrDefaultAsync(ct);

        if (scenario is null)
            throw new NotFoundException("Сценарий не существует");

        return scenario;
    }

    public async Task<Guid> AddCommandAsync(
        Guid scenarioId,
        Guid userId,
        Guid commandId,
        int order,
        CancellationToken ct)
    {
        var scenario = await _getScenarioQuery(context, scenarioId, userId)
            .Where(x => !x.IsSystem)
            .FirstOrDefaultAsync(ct);

        if (scenario is null)
            throw new NotFoundException("Сценарий не существует");

        var commandExists = await context.Commands
            .AnyAsync(x => x.Id == commandId && !x.IsDeleted && (x.UserId == userId || x.IsSystem), ct);

        if (!commandExists)
            throw new NotFoundException("Команда не найдена");

        var existsInScenario = await context.ScenarioCommands
            .AnyAsync(x => x.ScenarioId == scenarioId && x.CommandId == commandId, ct);

        if (existsInScenario)
            throw new BadRequestException("Команда уже добавлена в сценарий");

        var scenarioCommand = new ScenarioCommand
        {
            ScenarioId = scenarioId,
            CommandId = commandId,
            Order = order
        };

        context.ScenarioCommands.Add(scenarioCommand);
        await context.SaveChangesAsync(ct);

        return scenarioCommand.Id;
    }

    public async Task<bool> UpdateCommandOrderAsync(
        Guid scenarioId,
        Guid userId,
        Guid commandId,
        int order,
        CancellationToken ct)
    {
        var scenario = await _getScenarioQuery(context, scenarioId, userId)
            .Where(x => !x.IsSystem)
            .FirstOrDefaultAsync(ct);

        if (scenario is null)
            throw new NotFoundException("Сценарий не существует");

        var scenarioCommand = await context.ScenarioCommands
            .FirstOrDefaultAsync(x => x.ScenarioId == scenarioId && x.CommandId == commandId, ct);

        if (scenarioCommand is null)
            throw new NotFoundException("Команда в сценарии не найдена");

        scenarioCommand.Order = order;

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> RemoveCommandAsync(
        Guid scenarioId,
        Guid userId,
        Guid commandId,
        CancellationToken ct)
    {
        var scenario = await _getScenarioQuery(context, scenarioId, userId)
            .Where(x => !x.IsSystem)
            .FirstOrDefaultAsync(ct);

        if (scenario is null)
            throw new NotFoundException("Сценарий не существует");

        var scenarioCommand = await context.ScenarioCommands
            .FirstOrDefaultAsync(x => x.ScenarioId == scenarioId && x.CommandId == commandId, ct);

        if (scenarioCommand is null)
            throw new NotFoundException("Команда в сценарии не найдена");

        context.ScenarioCommands.Remove(scenarioCommand);
        await context.SaveChangesAsync(ct);

        return true;
    }
}
