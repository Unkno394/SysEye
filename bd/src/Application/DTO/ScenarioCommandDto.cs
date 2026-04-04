namespace Application.DTO;

public class ScenarioCommandDto
{
    public Guid CommandId { get; set; }
    public string CommandName { get; set; } = string.Empty;
    public int Order { get; set; }
}
