namespace Application.DTO;

public class TaskNotificationEventDto
{
    public string EventType { get; set; } = string.Empty;
    public Guid UserId { get; set; }
    public Guid AgentId { get; set; }
    public string AgentName { get; set; } = string.Empty;
    public Guid TaskId { get; set; }
    public string Status { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Output { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
    public int? ExitCode { get; set; }
    public DateTime CreatedAt { get; set; }
}
