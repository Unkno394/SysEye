using Domain.Models.Common;

namespace Domain.Models;

public class ScenarioCommand : IIdEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();

    public Guid ScenarioId { get; set; }
    public Guid CommandId { get; set; }

    public int Order { get; set; }

    public virtual Scenario Scenario { get; set; } = null!;
    public virtual Command Command { get; set; } = null!;
}