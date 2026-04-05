using Domain.Models.Common;

namespace Domain.Models;

public class TaskExecution : IIdEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CommandId { get; set; }
    public Guid AgentId { get; set; }
    public DateTime StartedAt { get; set; }
    public double DurationSeconds { get; set; }
    public bool IsSuccess { get; set; }

    public virtual Command Command { get; set; }
    public virtual Agent Agent { get; set; }
}