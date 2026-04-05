using Domain.Models;

namespace Web.Contracts.Requests;

public class UpdateAgentRequest
{
    public string? Name { get; set; }
    public string? Tag { get; set; }
    public OsType? Os { get; set; }
}