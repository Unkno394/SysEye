namespace Application.DTO;

public class ExecuteCommandRequest
{
    public Guid CommandId { get; set; }
    public Dictionary<int, string>? PlaceholderValues { get; set; } = new();
}
