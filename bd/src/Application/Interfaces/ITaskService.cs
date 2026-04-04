using Application.DTO;

namespace Application.Interfaces;

public interface ITaskService
{
    Task<AgentTaskDto> EnqueueCommandAsync(Guid agentId, Guid userId, string title, string command, CancellationToken ct);
    Task<PagedResult<AgentTaskDto>> GetAgentTasksAsync(Guid agentId, Guid userId, int take, int skip, CancellationToken ct);
    Task<InternalAgentTaskDto?> GetNextQueuedTaskAsync(Guid agentId, Guid userId, CancellationToken ct);
    Task AppendOutputAsync(Guid taskId, Guid userId, string chunk, CancellationToken ct);
    Task CompleteTaskAsync(Guid taskId, Guid userId, string status, string stdout, string stderr, int exitCode, CancellationToken ct);
}
