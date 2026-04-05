namespace Application.DTO.Scenario;

public class ExecuteScenarioCommandItem
{
    public Guid CommandId { get; set; }
    public Dictionary<int, string> PlaceholderValues { get; set; } = new();
}
