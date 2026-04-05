using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Infrastructure.Dto;
using Infrastructure.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public  class AgentLogsService(
    AppDbContext dbContext,
    ILokiLogReader lokiLogReader) : IAgentLogsService
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
        var executionExists = await dbContext.TaskExecutions.AsNoTracking()
            .AnyAsync(x => x.Id == executionId, cancellationToken);

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
        var execution = await dbContext.TaskExecutions
            .AsNoTracking()
            .Where(x => x.Id == executionId)
            .Select(x => new
            {
                x.Id,
                x.CommandId
            })
            .FirstOrDefaultAsync(cancellationToken);

        if (execution is null)
            throw new NotFoundException("Выполнение не найдено");

        var command = await dbContext.Commands
            .AsNoTracking()
            .FirstOrDefaultAsync(x =>
                x.Id == execution.CommandId &&
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
