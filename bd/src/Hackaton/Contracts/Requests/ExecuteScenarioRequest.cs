using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class ExecuteScenarioRequest
{
    [Required]
    public Guid ScenarioId { get; set; }
}
