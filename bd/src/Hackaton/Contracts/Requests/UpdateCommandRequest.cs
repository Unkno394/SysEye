namespace Web.Contracts.Requests;

public class UpdateCommandRequest
{
    public string? Name { get; set; }
    public string? Description { get; set; }
    public string? BashScript { get; set; }
    public string? PowerShellScript { get; set; }
    public string? Regex { get; set; }
    public string? Tag { get; set; }
}
