namespace Web.Contracts.Requests;

public class GenerateApiKeyRequest
{
    public Guid AgentId { get; set; }
    public int DaysToRevoke { get; set; }
}
