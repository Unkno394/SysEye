namespace Application.DTO.Analytics;

public class AnalyticsDto
{
    public int Executions { get; set; }
    public int Errors { get; set; }

    public double SuccessRate { get; set; }
    public double AverageDurationSeconds { get; set; }
    public double MinDurationSeconds { get; set; }
    public double MaxDurationSeconds { get; set; }
}