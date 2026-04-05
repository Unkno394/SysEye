using Infrastructure.BackgroundJobs;
using Infrastructure.BackgroundJobs.Jobs.Interfaces;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Infrastructure.Email;

public class EmailService(IOptions<SmtpOptions> options,
        ILogger<EmailService> logger,
        IBackgroundJobService backgroundJobService) : IEmailService
{
    public async Task SendAsync(string email, string subject, string text, CancellationToken ct = default)
    {
        backgroundJobService.Enqueue<IEmailBackgroundJob>(x => x.ProcessEmailSendingAsync(
            email,
            subject,
            text,
            options.Value.Host,
            options.Value.UsePortAndSsl,
            options.Value.Port,
            options.Value.Email,
            options.Value.Password,
            options.Value.Name,
            options.Value.TimeoutSeconds,
            options.Value.MaxRetryAttempts,
            options.Value.RetryDelaySeconds
        ));

        logger.LogInformation("Email job enqueued for {Email}", email);
    }
}
