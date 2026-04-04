namespace Application.DTO;

public class AgentMetricsDto
{
    public Guid AgentId { get; set; }
    public int TotalRuns { get; set; }
    public int SuccessfulRuns { get; set; }
    public int FailedRuns { get; set; }
    public int RunningRuns { get; set; }
    public int QueuedRuns { get; set; }
    public int RunsToday { get; set; }
    public int ErrorsToday { get; set; }
    public double AverageDurationSeconds { get; set; }
    public double SuccessRate { get; set; }
    public List<AgentMetricsPointDto> Activity { get; set; } = [];
}
