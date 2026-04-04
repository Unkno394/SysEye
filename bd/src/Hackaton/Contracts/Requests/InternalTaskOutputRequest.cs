using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class InternalTaskOutputRequest
{
    [Required]
    public Guid TaskId { get; set; }

    [Required]
    public string Chunk { get; set; } = string.Empty;
}
