
namespace Infrastructure.BackgroundJobs.Jobs;

public interface IApiKeyCleanupJob
{
    Task CleanupExpiredApiKeysAsync(CancellationToken ct = default);
}