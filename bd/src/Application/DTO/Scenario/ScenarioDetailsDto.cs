using Application.DTO.Scenario;

public class ScenarioDetailsDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public List<ScenarioCommandDto> Commands { get; set; } = new();
}