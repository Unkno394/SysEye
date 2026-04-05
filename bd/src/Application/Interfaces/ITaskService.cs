using Application.DTO;

public interface ITaskService
{
    Task<Guid> ExecuteCommandAsync(Guid userId, Guid agentId, ExecuteCommandRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<Guid>> ExecuteScenarioAsync(Guid userId, Guid agentId, Guid scenarioId, CancellationToken cancellationToken = default);
    Task<InternalAgentTaskDto?> GetNextQueuedTaskAsync(Guid agentId, Guid userId, CancellationToken cancellationToken = default);
    Task CancelTaskAsync(Guid taskId, Guid userId, CancellationToken cancellationToken = default);
    Task AppendOutputAsync(Guid taskId, Guid userId, string chunk, CancellationToken cancellationToken = default);
    Task CompleteTaskAsync(Guid taskId, Guid userId, string status, string stdout, string stderr, int? exitCode, CancellationToken cancellationToken = default);
    Task<PagedResult<TaskExecutionDto>> GetTasksByAgent(Guid userId, Guid agentId, int take, int skip, CancellationToken cancellationToken = default);
    Task<PagedResult<TaskExecutionDto>> GetTasksByUserAsync(Guid userId, int take, int skip, CancellationToken ct = default);
}
