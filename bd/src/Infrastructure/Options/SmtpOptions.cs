namespace Infrastructure.Options;

public class SmtpOptions
{
    public string Host { get; set; }
    public string Name { get; set; }
    public int Port { get; set; }
    public string Email { get; set; }
    public string Password { get; set; }

    public int MaxRetryAttempts { get; set; } = 3;
    public int TimeoutSeconds { get; set; } = 60;
    public bool UsePortAndSsl { get; set; } = false;
    public int RetryDelaySeconds { get; set; } = 5;
}