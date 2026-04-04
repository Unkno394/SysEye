namespace Application.DTO;

public class CommandDto
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public string Name { get; set; }
    public string Description { get; set; }
    public string BashScript { get; set; }
    public string PowerShellScript { get; set; }
    public bool IsSystem { get; set; } = false;
}
