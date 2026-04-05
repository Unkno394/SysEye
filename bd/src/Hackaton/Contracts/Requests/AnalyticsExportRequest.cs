namespace Web.Contracts.Requests;

public class AnalyticsExportRequest
{
    public DateTime? FromUtc { get; init; }
    public DateTime? ToUtc { get; init; }

    public Guid? AgentId { get; init; }
    public Guid? CommandId { get; init; }
}
