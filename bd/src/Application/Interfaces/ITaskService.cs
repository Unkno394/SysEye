using Application.DTO;

public interface ITaskService
{
    Task<AgentTaskDto> EnqueueCommandAsync(Guid agentId, Guid userId, string title, string command, CancellationToken cancellationToken = default);
    Task<List<AgentTaskDto>> EnqueueScenarioAsync(Guid agentId, Guid userId, Guid scenarioId, CancellationToken cancellationToken = default);
    Task<List<InternalAgentTaskDto>> GetQueuedTasksAsync(Guid agentId, Guid userId, CancellationToken cancellationToken = default);
    Task<PagedResult<AgentTaskDto>> GetAgentTasksAsync(Guid agentId, Guid userId, int take, int skip, CancellationToken cancellationToken = default);
    Task<AgentMetricsDto> GetAgentMetricsAsync(Guid agentId, Guid userId, CancellationToken cancellationToken = default);
    Task<InternalAgentTaskDto?> GetNextQueuedTaskAsync(Guid agentId, Guid userId, CancellationToken cancellationToken = default);
    Task AppendOutputAsync(Guid taskId, Guid userId, string chunk, CancellationToken cancellationToken = default);
    Task CompleteTaskAsync(Guid taskId, Guid userId, string status, string stdout, string stderr, int? exitCode, CancellationToken cancellationToken = default);
    Task<Guid> ExecuteCommandAsync(Guid userId, Guid agentId, ExecuteCommandRequest request, CancellationToken cancellationToken = default);
}
