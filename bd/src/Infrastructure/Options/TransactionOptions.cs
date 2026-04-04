namespace Infrastructure.Options;

public class TransactionOptions
{
    public int MaxRetryCount { get; set; } = 3;
    public bool EnableRetryOnFailure { get; set; } = true;
    public bool UseExponentialBackoff { get; set; } = true;
    public int FixedDelayMs { get; set; } = 200;
}
