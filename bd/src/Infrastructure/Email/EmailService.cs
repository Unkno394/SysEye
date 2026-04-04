using Infrastructure.BackgroundJobs;
using Infrastructure.BackgroundJobs.Jobs.Interfaces;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Infrastructure.Email
{

    public class EmailService : IEmailService
    {
        private readonly SmtpOptions _options;
        private readonly ILogger<EmailService> _logger;
        private readonly IBackgroundJobService _backgroundJobService;

        public EmailService(
            IOptions<SmtpOptions> options,
            ILogger<EmailService> logger,
            IBackgroundJobService backgroundJobService)
        {
            _logger = logger;
            _options = options.Value;
            _backgroundJobService = backgroundJobService;
        }

        public async Task SendAsync(string email, string subject, string text, CancellationToken ct = default)
        {
            _backgroundJobService.Enqueue<IEmailBackgroundJob>(x => x.ProcessEmailSendingAsync(
                email,
                subject,
                text,
                _options.Host,
                _options.UsePortAndSsl,
                _options.Port,
                _options.Email,
                _options.Password,
                _options.Name,
                _options.TimeoutSeconds,
                _options.MaxRetryAttempts,
                _options.RetryDelaySeconds
            ));

            _logger.LogInformation("Email job enqueued for {Email}", email);
        }
    }
}
