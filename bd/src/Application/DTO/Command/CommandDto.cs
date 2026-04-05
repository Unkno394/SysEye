namespace Application.DTO.Command;

public class CommandDto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; }
    public bool IsSystem { get; set; } = false;
    public string? LogRegex { get; set; }
    public string? Tag { get; set; }
}