namespace Application.DTO;

public class AgentMetricsPointDto
{
    public DateTime Date { get; set; }
    public int TotalRuns { get; set; }
    public int SuccessRuns { get; set; }
    public int ErrorRuns { get; set; }
    public double AverageDurationSeconds { get; set; }
}
