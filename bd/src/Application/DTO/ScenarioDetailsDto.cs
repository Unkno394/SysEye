using Application.DTO;

public class ScenarioDetailsDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public bool IsSystem { get; set; } = false;

    public List<ScenarioCommandDto> Commands { get; set; } = new();
}
