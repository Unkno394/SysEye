namespace Application.DTO.Analytics;

public class CommandAnalyticsDto
{
    public Guid CommandId { get; set; }
    public string CommandName { get; set; }

    public AnalyticsDto Total { get; set; }
    public AnalyticsDto Today { get; set; }
}
