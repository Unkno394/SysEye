using Hangfire;
using Infrastructure.BackgroundJobs.Jobs;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Infrastructure.BackgroundJobs;

public class RecurringJobsSetup : IHostedService
{
    private readonly IServiceProvider _serviceProvider;

    public RecurringJobsSetup(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public Task StartAsync(CancellationToken cancellationToken)
    {
        using var scope = _serviceProvider.CreateScope();
        var recurringJobManager = scope.ServiceProvider.GetRequiredService<IRecurringJobManager>();

        recurringJobManager.AddOrUpdate<IApiKeyCleanupJob>(
            "api-key-cleanup",
            job => job.CleanupExpiredApiKeysAsync(CancellationToken.None),
            Cron.Daily);

        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
}
