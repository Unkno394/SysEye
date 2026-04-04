namespace Web.Contracts.Requests;

public class InternalHeartbeatRequest
{
    public string? IpAddress { get; set; }
    public int? Port { get; set; }
    public string? Distribution { get; set; }
}
