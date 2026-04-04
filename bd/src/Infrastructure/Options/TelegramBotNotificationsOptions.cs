namespace Infrastructure.Options;

public class TelegramBotNotificationsOptions
{
    public bool Enabled { get; set; }
    public string Endpoint { get; set; } = string.Empty;
    public string Secret { get; set; } = string.Empty;
    public string SecretHeaderName { get; set; } = "X-Webhook-Secret";
    public int TimeoutSeconds { get; set; } = 5;
}
