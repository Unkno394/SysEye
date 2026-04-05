using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class CreateCommandRequest
{
    [Required]
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; } = string.Empty;
    public string? BashScript { get; set; } = string.Empty;
    public string? PowerShellScript { get; set; } = string.Empty;
    public string? Tag { get; set; } = string.Empty;
}
