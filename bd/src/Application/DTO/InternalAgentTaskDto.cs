namespace Application.DTO;

public class InternalAgentTaskDto
{
    public Guid TaskId { get; set; }
    public string TaskType { get; set; } = "command";
    public string Title { get; set; } = string.Empty;
    public string Command { get; set; } = string.Empty;
}
