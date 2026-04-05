using Application.DTO;
using Application.DTO.Scenario;

public interface ITaskService
{
    Task<Guid> ExecuteCommand(Guid userId, Guid agentId, ExecuteCommandRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<Guid>> ExecuteScenario(Guid userId, Guid agentId, Guid scenarioId, List<ExecuteScenarioCommandItem> commands, CancellationToken cancellationToken = default);
    Task<PagedResult<TaskExecutionDto>> GetTasksByAgent(Guid userId, Guid agentId, int take, int skip, CancellationToken cancellationToken = default);
    Task<PagedResult<TaskExecutionDto>> GetTasksByUser(Guid userId, int take, int skip, CancellationToken ct = default);
}