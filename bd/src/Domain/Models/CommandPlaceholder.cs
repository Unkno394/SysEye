using Domain.Models.Common;

namespace Domain.Models;

public class CommandPlaceholder : IIdEntity
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public Guid CommandId { get; set; }

    public int Index { get; set; }
    public string Name { get; set; }

    public virtual Command Command { get; set; } = null!;
}

