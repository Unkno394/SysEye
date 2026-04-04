using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class InternalTaskResultRequest
{
    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public string Status { get; set; } = string.Empty;

    public string Stdout { get; set; } = string.Empty;
    public string Stderr { get; set; } = string.Empty;
    public int ExitCode { get; set; }
}
