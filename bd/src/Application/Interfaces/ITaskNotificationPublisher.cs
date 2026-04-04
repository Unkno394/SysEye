using Application.DTO;

namespace Application.Interfaces;

public interface ITaskNotificationPublisher
{
    Task PublishTaskQueuedAsync(Guid userId, Guid agentId, AgentTaskDto task, CancellationToken cancellationToken = default);
    Task PublishTaskUpdatedAsync(Guid userId, Guid agentId, AgentTaskDto task, CancellationToken cancellationToken = default);
}
