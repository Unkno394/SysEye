namespace Application.DTO;

public class TaskExecutionDto
{
    public Guid Id { get; set; }
    public Guid CommandId { get; set; }
    public Guid AgentId { get; set; }
    public DateTime StartedAt { get; set; }
    public double DurationSeconds { get; set; }
    public bool IsSuccess { get; set; }
}