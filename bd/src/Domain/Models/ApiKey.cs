using Domain.Models.Common;

namespace Domain.Models;

public class ApiKey : IIdEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid? AgentId { get; set; }
    public Guid? UserId { get; set; }

    public string Value { get; set; } = string.Empty;

    public DateTime? RevokedAt { get; set; }

    public virtual Agent? Agent { get; set; }
}
