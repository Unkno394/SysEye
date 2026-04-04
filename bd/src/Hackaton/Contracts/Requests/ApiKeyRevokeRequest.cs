namespace Web.Contracts.Requests;

public class ApiKeyRevokeRequest
{
    public Guid AgentId { get; set; }
    public Guid ApiKeyId { get; set; }
}
