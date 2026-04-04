namespace Application.DTO;

public class TaskExecutionDto
{
    public Guid Id { get; set; }
    public Guid CommandId { get; set; }
    public Guid AgentId { get; set; }
    public string Title { get; set; } = string.Empty;
    public DateTime StartedAt { get; set; }
    public string Status { get; set; } = "sent";
    public DateTime? CompletedAt { get; set; }
    public double? DurationSeconds { get; set; }
    public int? ExitCode { get; set; }
    public string ResultSummary { get; set; } = string.Empty;
    public string RawOutput { get; set; } = string.Empty;
    public string RawError { get; set; } = string.Empty;
}
