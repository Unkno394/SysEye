using Domain.Models;
using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class InternalRegisterAgentRequest
{
    public Guid? AgentId { get; set; }

    [Required]
    public string Name { get; set; } = string.Empty;

    public string? IpAddress { get; set; }
    public int? Port { get; set; }
    public OsType? Os { get; set; }
    public string? Distribution { get; set; }
}
