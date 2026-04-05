namespace Application.DTO.Analytics;

public class AnalyticsFullExportDto
{
    public DateTime ExportedAtUtc { get; set; }

    public IReadOnlyCollection<AgentAnalyticsTotalDto> AgentAnalytics { get; set; } = [];
    public IReadOnlyCollection<CommandAnalyticsTotalDto> CommandAnalytics { get; set; } = [];
    public IReadOnlyCollection<TaskExecutionDto> TaskExecutions { get; set; } = [];
}
