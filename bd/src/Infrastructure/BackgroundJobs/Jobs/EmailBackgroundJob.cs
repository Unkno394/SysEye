using Infrastructure.BackgroundJobs.Jobs.Interfaces;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using MimeKit;
using Polly;

namespace Infrastructure.BackgroundJobs.Jobs
{
    public class EmailBackgroundJob : IEmailBackgroundJob
    {
        private readonly ILogger<EmailBackgroundJob> _logger;

        public EmailBackgroundJob(ILogger<EmailBackgroundJob> logger)
        {
            _logger = logger;
        }

        public async Task ProcessEmailSendingAsync(
            string recipientEmail,
            string subject,
            string htmlText,
            string smtpHost,
            bool useSslAndPort,
            int smtpPort,
            string senderEmail,
            string senderPassword,
            string senderName,
            int timeoutSeconds,
            int maxRetryAttempts,
            int retryDelaySeconds)
        {
            var retryPolicy = Policy
                .Handle<IOException>()
                .Or<TimeoutException>()
                .Or<SmtpCommandException>(ex =>
                    ex.StatusCode == SmtpStatusCode.ServiceClosingTransmissionChannel ||
                    ex.StatusCode == SmtpStatusCode.TransactionFailed)
                .Or<Exception>(ex =>
                    ex.Message.Contains("timed out", StringComparison.OrdinalIgnoreCase) ||
                    ex.Message.Contains("connection", StringComparison.OrdinalIgnoreCase) ||
                    ex.Message.Contains("network", StringComparison.OrdinalIgnoreCase))
                .WaitAndRetryAsync(
                    maxRetryAttempts,
                    retryAttempt => TimeSpan.FromSeconds(retryDelaySeconds * Math.Pow(2, retryAttempt - 1)),
                    onRetry: (outcome, timespan, retryCount, context) =>
                    {
                        _logger.LogWarning(
                            outcome.InnerException,
                            "Retry {RetryCount} after {Delay}s for sending email to {Recipient}. Exception: {ExceptionMessage}",
                            retryCount, timespan.TotalSeconds, recipientEmail, outcome.InnerException?.Message);
                    });

            await retryPolicy.ExecuteAsync(async () =>
            {
                await SendEmailCoreAsync(recipientEmail, subject, htmlText, smtpHost, useSslAndPort, smtpPort, senderEmail, senderPassword, senderName, timeoutSeconds);
            });
        }

        private async Task SendEmailCoreAsync(
            string recipientEmail,
            string subject,
            string htmlText,
            string smtpHost,
            bool useSslAndPort,
            int smtpPort,
            string senderEmail,
            string senderPassword,
            string senderName,
            int timeoutSeconds)
        {
            using var client = new SmtpClient();
            using var message = new MimeMessage();

            message.From.Add(new MailboxAddress(senderName, senderEmail));
            message.To.Add(new MailboxAddress("", recipientEmail));
            message.Subject = subject;
            message.Body = new TextPart("html") { Text = htmlText };

            client.Timeout = timeoutSeconds * 1000;

            try
            {
                if (useSslAndPort)
                    await client.ConnectAsync(smtpHost, smtpPort, SecureSocketOptions.SslOnConnect);

                await client.ConnectAsync(smtpHost);
                await client.AuthenticateAsync(senderEmail, senderPassword);
                await client.SendAsync(message);

                _logger.LogInformation("Email successfully sent to {RecipientEmail}", recipientEmail);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {RecipientEmail} during execution attempt.", recipientEmail);
                throw;
            }
            finally
            {
                if (client.IsConnected)
                {
                    await client.DisconnectAsync(true);
                }
            }
        }
    }
}
