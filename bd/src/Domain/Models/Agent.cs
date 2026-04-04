using Domain.Models.Common;

namespace Domain.Models;

public class Agent : IEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    public string Name { get; set; } = string.Empty;
    public OsType? Os { get; set; }
    public string? IpAddress { get; set; }
    public int? Port { get; set; }
    public string? Distribution { get; set; }
    public DateTime LastHeartbeatAt { get; set; }

    public bool IsDeleted { get; set; } = false;

    public virtual User? User { get; set; }
}
