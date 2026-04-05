namespace Application.DTO.Analytics;

public class AgentAnalyticsTotalDto
{
    public Guid AgentId { get; set; }
    public string AgentName { get; set; }

    public AnalyticsDto Total { get; set; }
}