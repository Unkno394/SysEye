using Domain.Models.Common;

namespace Domain.Models;

public class ApiKey : IEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public bool IsRevoked { get; set; } = false;
    public bool IsDeleted { get; set; } = false;

    public virtual User User { get; set; }
}