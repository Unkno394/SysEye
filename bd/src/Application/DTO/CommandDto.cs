namespace Application.DTO;

public class CommandDto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Description { get; set; } = string.Empty;
    public string BashScript { get; set; } = string.Empty;
    public string PowerShellScript { get; set; } = string.Empty;
    public string Name { get; set; }
    public bool IsSystem { get; set; } = false;
}
