namespace Application.DTO;

public class AgentConnectionTokenDto
{
    public Guid AgentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Token { get; set; } = string.Empty;
}
