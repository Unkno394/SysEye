using Application.DTO.Scenario;

namespace Web.Contracts.Requests;


public class ExecuteScenarioRequest
{
    public Guid ScenarioId { get; set; }
    public List<ExecuteScenarioCommandItem> Commands { get; set; } = new();
}

