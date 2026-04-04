using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class QueueCommandTaskRequest
{
    [Required]
    public string Title { get; set; } = string.Empty;

    [Required]
    public string Command { get; set; } = string.Empty;
}
