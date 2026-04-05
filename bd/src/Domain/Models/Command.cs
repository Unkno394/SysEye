using Domain.Models.Common;

namespace Domain.Models;

public class Command : IEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    public string Name { get; set; }
    public string Description { get; set; }
    public string BashScript { get; set; }
    public string PowerShellScript { get; set; }
    public string? LogRegex { get; set; }
    public string? Tag { get; set; }

    public bool IsDeleted { get; set; }
    public bool IsSystem { get; set; } = false;

    public virtual User User { get; set; }
    public virtual ICollection<CommandPlaceholder> Placeholders { get; set; } = new List<CommandPlaceholder>();
}
