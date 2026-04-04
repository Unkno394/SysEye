namespace Infrastructure.Options;

public class LokiOptions
{
    public string BaseUrl { get; set; } = null!;
    public int TimeoutSeconds { get; set; } = 10;
}