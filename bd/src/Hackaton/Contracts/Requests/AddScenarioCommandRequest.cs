namespace Web.Contracts.Requests;

public class AddScenarioCommandRequest
{
    public Guid CommandId { get; set; }
    public int Order { get; set; }
}
