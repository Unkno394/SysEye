namespace Infrastructure.BackgroundJobs.Jobs.Interfaces
{
    public interface IEmailBackgroundJob
    {
        Task ProcessEmailSendingAsync(string recipientEmail, string subject, string htmlText, string smtpHost, bool useSslAndPort, int smtpPort, string senderEmail, string senderPassword, string senderName, int timeoutSeconds, int maxRetryAttempts, int retryDelaySeconds);
    }
}
