using Domain.Models.Common;

namespace Domain.Models;

public class Scenario : IEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid UserId { get; set; }

    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;

    public bool IsDeleted { get; set; } = false;
    public bool IsSystem { get; set; } = false;

    public virtual User User { get; set; } = null!;
    public virtual ICollection<ScenarioCommand> Commands { get; set; } = new List<ScenarioCommand>();
}
