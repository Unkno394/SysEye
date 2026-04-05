using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class CommandService(AppDbContext context) : ICommandService
{
    private static readonly Func<AppDbContext, Guid, Guid, IQueryable<Command>> _getCommandQuery
        = (context, commandId, userId) => context.Commands
        .Where(c => c.Id == commandId && !c.IsDeleted && (c.UserId == userId || c.IsSystem));

    #region Commands
    public async Task<Command> CreateAsync(
        Guid userId,
        string name,
        string description,
        string bashScript,
        string powerShellScript,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(name))
            throw new BadRequestException("Имя команды не может быть пустым");

        var command = new Command
        {
            Name = name.Trim(),
            Description = description ?? string.Empty,
            BashScript = bashScript ?? string.Empty,
            PowerShellScript = powerShellScript ?? string.Empty,
            UserId = userId
        };

        context.Commands.Add(command);
        await context.SaveChangesAsync(ct);
        return command;
    }


    public async Task<PagedResult<CommandDto>> GetUserCommandsAsync(Guid userId, int take, int skip, CancellationToken ct)
    {
        var query = context.Commands.AsNoTracking()
            .Where(c => !c.IsDeleted && (c.UserId == userId || c.IsSystem));

        var commands = await query
            .OrderByDescending(c => c.IsSystem)
            .ThenBy(c => c.Name)
            .Skip(skip)
            .Take(take)
            .Select(c => new CommandDto
            {
                Id = c.Id,
                IsSystem = c.IsSystem,
                Name = c.Name,
                Description = c.Description,
                BashScript = c.BashScript,
                PowerShellScript = c.PowerShellScript,
                LogRegex = c.LogRegex,
            })
            .ToListAsync(ct);

        var count = await query.CountAsync(ct);

        return new PagedResult<CommandDto>
        {
            Items = commands,
            TotalCount = count,
            Skip = skip,
            Take = take
        };
    }

    public async Task<bool> UpdateAsync(
        Guid commandId,
        Guid userId,
        string? name,
        string? description,
        string? bashScript,
        string? powerShellScript,
        string? logRegex,
        CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        if (!string.IsNullOrWhiteSpace(name))
            command.Name = name.Trim();

        if (description != null)
            command.Description = description;

        if (bashScript != null)
            command.BashScript = bashScript;

        if (powerShellScript != null)
            command.PowerShellScript = powerShellScript;

        if (logRegex != null)
            command.LogRegex = logRegex;

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeleteAsync(Guid commandId, Guid userId, CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        command.IsDeleted = true;
        await context.SaveChangesAsync(ct);
        return true;
    }
    #endregion

    #region Placeholderspublic
    public async Task<List<CommandPlaceholderDto>> GetCommandPlaceholdersAsync(Guid commandId, Guid userId, CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId).FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        return await context.CommandPlaceholders
            .Where(p => p.CommandId == commandId)
            .Select(p => new CommandPlaceholderDto
            {
                Index = p.Index,
                Name = p.Name,
            })
            .ToListAsync(ct);
    }

    public async Task<CommandPlaceholder> AddPlaceholderAsync(
       Guid commandId,
       Guid userId,
       int index,
       string name,
       CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        var placeholder = new CommandPlaceholder
        {
            CommandId = command.Id,
            Index = index,
            Name = name.Trim()
        };

        context.CommandPlaceholders.Add(placeholder);
        await context.SaveChangesAsync(ct);
        return placeholder;
    }

    public async Task<bool> UpdatePlaceholderAsync(
        Guid commandId,
        Guid userId,
        int index,
        string? name,
        CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        var placeholder = await context.CommandPlaceholders
            .FirstOrDefaultAsync(p => p.CommandId == commandId && p.Index == index, ct);

        if (placeholder == null) throw new NotFoundException("Плейсхолдер не найден");

        if (!string.IsNullOrWhiteSpace(name))
            placeholder.Name = name.Trim();

        await context.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> DeletePlaceholderAsync(
        Guid commandId,
        Guid userId,
        int index,
        CancellationToken ct)
    {
        var command = await _getCommandQuery(context, commandId, userId)
            .Where(c => !c.IsSystem)
            .FirstOrDefaultAsync(ct);
        if (command == null) throw new NotFoundException("Команда не существует");

        var placeholder = await context.CommandPlaceholders
            .FirstOrDefaultAsync(p => p.CommandId == commandId && p.Index == index, ct);

        if (placeholder == null) throw new NotFoundException("Плейсхолдер не найден");

        context.CommandPlaceholders.Remove(placeholder);
        await context.SaveChangesAsync(ct);
        return true;
    }
    #endregion
}
