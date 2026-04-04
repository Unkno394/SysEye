namespace Infrastructure.Options;

public class ApiKeyOptions
{
    public string ApiKeyHeader { get; set; }
    public string AgentIdHeader { get; set; }
    public bool UseApiKeyAccess { get; set; }
}