using Domain.Models;

namespace Web.Contracts.Requests;

public class UpdateAgentRequest
{
    public string? Name { get; set; }
    public string? IpAddress { get; set; }
    public OsType? Os { get; set; }
}