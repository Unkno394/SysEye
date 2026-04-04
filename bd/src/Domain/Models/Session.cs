using Domain.Models.Common;

namespace Domain.Models;

public class Session : IIdEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid TokenId { get; set; }
    public Guid UserId { get; set; }

    public DateTime LoginDate { get; set; } = DateTime.UtcNow;
    public DateTime LastActivity { get; set; } = DateTime.UtcNow;
    public DateTime? LogoutDate { get; set; }

    public bool IsActive { get; set; } = true;

    public virtual User User { get; set; }
    public virtual Token Token { get; set; }
}
