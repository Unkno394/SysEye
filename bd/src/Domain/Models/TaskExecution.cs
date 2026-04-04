using Domain.Models.Common;

namespace Domain.Models;

public class TaskExecution : IIdEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CommandId { get; set; }
    public Guid AgentId { get; set; }
    public DateTime StartedAt { get; set; }
    public string Status { get; set; } = "sent";
    public DateTime? CompletedAt { get; set; }
    public double? DurationSeconds { get; set; }
    public int? ExitCode { get; set; }
    public string ResultSummary { get; set; } = string.Empty;

    public virtual Command Command { get; set; }
    public virtual Agent Agent { get; set; }
}
