namespace Application.DTO;

public class CommandDto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public string BashScript { get; set; } = string.Empty;
    public string PowerShellScript { get; set; } = string.Empty;
    public bool IsSystem { get; set; } = false;
    public string? LogRegex { get; set; }
}
