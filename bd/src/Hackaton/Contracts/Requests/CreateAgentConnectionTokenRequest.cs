using System.ComponentModel.DataAnnotations;

namespace Web.Contracts.Requests;

public class CreateAgentConnectionTokenRequest
{
    [MaxLength(120)]
    public string? Name { get; set; }
}
