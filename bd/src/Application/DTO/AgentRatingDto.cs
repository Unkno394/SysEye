namespace Application.DTO;

public class AgentRatingDto
{
    public int Rank { get; set; }
    public Guid AgentId { get; set; }
    public string AgentName { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public Domain.Models.OsType? Os { get; set; }
    public string? Distribution { get; set; }
    public DateTime LastHeartbeatAt { get; set; }
    public int TotalRuns { get; set; }
    public int ErrorsToday { get; set; }
    public double AverageDurationSeconds { get; set; }
    public double SuccessRate { get; set; }
    public double StabilityScore { get; set; }
    public double SpeedScore { get; set; }
    public double OverallScore { get; set; }
}
