using Domain.Models.Common;

namespace Domain.Models;

public class AgentTask : IEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid AgentId { get; set; }
    public Guid UserId { get; set; }
    public Guid? CommandId { get; set; }

    public string Title { get; set; } = string.Empty;
    public string Command { get; set; } = string.Empty;
    public string Status { get; set; } = "queued";
    public string Output { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
    public int? ExitCode { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? StartedAt { get; set; }
    public DateTime? FinishedAt { get; set; }
    public bool IsDeleted { get; set; } = false;

    public virtual Agent? Agent { get; set; }
    public virtual User? User { get; set; }
}
