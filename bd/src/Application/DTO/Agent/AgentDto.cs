using Domain.Models;

namespace Application.DTO.Agent;

public class AgentDto
{
    public Guid Id { get; set; }
    public string Name { get; set; }
    public string Tag { get; set; }
    public OsType? Os { get; set; }
    public DateTime LastHeartbeatAt { get; set; }
}