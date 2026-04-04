namespace Infrastructure.Dto;

public class AgentLogDto
{
    public Guid? ExecutionId { get; set; }
    public string Message { get; set; }
    public string Level { get; set; }
    public DateTimeOffset Timestamp { get; set; }
    public double DurationSeckonds { get; set; }
    public Guid? CommandId { get; set; }
    public string? Category { get; set; }
}
