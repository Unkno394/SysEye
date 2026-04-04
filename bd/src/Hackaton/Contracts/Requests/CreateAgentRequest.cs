using Domain.Models;
using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class CreateAgentRequest
{
    [Required]
    public string Name { get; set; } = string.Empty;
    public string? IpAddress { get; set; }
    public OsType? Os { get; set; }
}