using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Infrastructure.Dto;
using Microsoft.EntityFrameworkCore;

namespace Infrastructure.Services;

public sealed class AgentLogsService(
    AppDbContext dbContext,
    LokiLogReader lokiLogReader) : IAgentLogsService
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

        return await lokiLogReader.GetByAgentAsync(
            agentId.ToString(),
            limit,
            cancellationToken);
    }

    public async Task<IReadOnlyCollection<AgentLogDto>> GetByExecutionAsync(
        Guid executionId,
        int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var executionExists = await dbContext.AgentTasks.AsNoTracking()
            .AnyAsync(x => x.Id == executionId && !x.IsDeleted, cancellationToken);

        if (!executionExists)
            throw new NotFoundException("Выполнение не найдено");

        return await lokiLogReader.GetByExecutionAsync(
            executionId,
            limit,
            cancellationToken);
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
                x.UserId == userId &&
                !x.IsDeleted,
                cancellationToken);

        if (command is null)
            throw new NotFoundException("Команда не найдена");

        if (string.IsNullOrWhiteSpace(command.LogRegex))
            throw new BadRequestException("У команды не задан LogRegex");

        return await lokiLogReader.GetByExecutionRegexAsync(
            executionId,
            command.LogRegex,
            limit,
            cancellationToken);
    }
}
