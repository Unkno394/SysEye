namespace Application.DTO.Agent;

public class AgentCommandDto
{
    public Guid ExecutionId { get; set; }
    public Guid CommandId { get; set; }
    public string CommandName { get; set; } = string.Empty;
    public string Script { get; set; } = string.Empty;
}
