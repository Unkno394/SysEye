using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class TaskService(AppDbContext context) : ITaskService
{
    public async Task<AgentTaskDto> EnqueueCommandAsync(Guid agentId, Guid userId, string title, string command, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(command))
            throw new BadRequestException("Команда не может быть пустой");

        var agent = await context.Agents
            .FirstOrDefaultAsync(a => a.Id == agentId && a.UserId == userId && !a.IsDeleted, ct);

        if (agent == null)
            throw new NotFoundException("Агент не найден");

        var task = new AgentTask
        {
            AgentId = agentId,
            UserId = userId,
            Title = string.IsNullOrWhiteSpace(title) ? "Команда" : title.Trim(),
            Command = command.Trim(),
            Status = "queued",
            Output = string.Empty,
            Error = string.Empty,
            CreatedAt = DateTime.UtcNow,
        };

        context.AgentTasks.Add(task);
        await context.SaveChangesAsync(ct);

        return Map(task);
    }

    public async Task<PagedResult<AgentTaskDto>> GetAgentTasksAsync(Guid agentId, Guid userId, int take, int skip, CancellationToken ct)
    {
        var query = context.AgentTasks
            .Where(task => task.AgentId == agentId && task.UserId == userId && !task.IsDeleted)
            .OrderByDescending(task => task.CreatedAt);

        var items = await query
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
            .ToListAsync(ct);

        var totalCount = await query.CountAsync(ct);

        return new PagedResult<AgentTaskDto>
        {
            Items = items,
            TotalCount = totalCount,
            Take = take,
            Skip = skip,
        };
    }

    public async Task<InternalAgentTaskDto?> GetNextQueuedTaskAsync(Guid agentId, Guid userId, CancellationToken ct)
    {
        var task = await context.AgentTasks
            .Where(item => item.AgentId == agentId && item.UserId == userId && item.Status == "queued" && !item.IsDeleted)
            .OrderBy(item => item.CreatedAt)
            .FirstOrDefaultAsync(ct);

        if (task == null)
            return null;

        task.Status = "running";
        task.StartedAt = DateTime.UtcNow;
        await context.SaveChangesAsync(ct);

        return new InternalAgentTaskDto
        {
            TaskId = task.Id,
            TaskType = "command",
            Title = task.Title,
            Command = task.Command,
        };
    }

    public async Task AppendOutputAsync(Guid taskId, Guid userId, string chunk, CancellationToken ct)
    {
        var task = await context.AgentTasks
            .FirstOrDefaultAsync(item => item.Id == taskId && item.UserId == userId && !item.IsDeleted, ct);

        if (task == null)
            throw new NotFoundException("Задача не найдена");

        if (string.IsNullOrWhiteSpace(chunk))
            return;

        task.Status = "running";
        task.Output = string.IsNullOrWhiteSpace(task.Output)
            ? chunk.Trim()
            : $"{task.Output}\n{chunk.Trim()}";

        await context.SaveChangesAsync(ct);
    }

    public async Task CompleteTaskAsync(Guid taskId, Guid userId, string status, string stdout, string stderr, int exitCode, CancellationToken ct)
    {
        var task = await context.AgentTasks
            .FirstOrDefaultAsync(item => item.Id == taskId && item.UserId == userId && !item.IsDeleted, ct);

        if (task == null)
            throw new NotFoundException("Задача не найдена");

        task.Status = string.Equals(status, "success", StringComparison.OrdinalIgnoreCase) ? "success" : "error";
        task.Output = !string.IsNullOrWhiteSpace(stdout) ? stdout : task.Output;
        task.Error = stderr ?? string.Empty;
        task.ExitCode = exitCode;
        task.FinishedAt = DateTime.UtcNow;

        await context.SaveChangesAsync(ct);
    }

    private static AgentTaskDto Map(AgentTask task)
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
}
