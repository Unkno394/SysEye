namespace Application.DTO.Analytics;

public class AgentAnalyticsDto
{
    public Guid AgentId { get; set; }
    public string AgentName { get; set; }

    public AnalyticsDto Total { get; set; }
    public AnalyticsDto Today { get; set; }
}
