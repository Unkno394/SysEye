namespace Application.DTO;

public class AgentTaskDto
{
    public Guid Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Output { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
    public int? ExitCode { get; set; }
    public DateTime CreatedAt { get; set; }
}
