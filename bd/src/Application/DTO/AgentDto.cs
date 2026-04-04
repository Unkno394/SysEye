using Domain.Models;

namespace Application.DTO;

public class AgentDto
{
    public Guid Id { get; set; }
    public string Name { get; set; }
    public OsType? Os { get; set; }
    public string? IpAddress { get; set; }
    public int? Port { get; set; }
    public string? Distribution { get; set; }
    public DateTime LastHeartbeatAt { get; set; }
}
