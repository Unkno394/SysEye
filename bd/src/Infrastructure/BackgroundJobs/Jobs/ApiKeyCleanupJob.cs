using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Infrastructure.DbContexts;

namespace Infrastructure.BackgroundJobs.Jobs;


public class ApiKeyCleanupJob(AppDbContext _context,
    ILogger<ApiKeyCleanupJob> _logger) : IApiKeyCleanupJob
{
    public async Task CleanupExpiredApiKeysAsync(CancellationToken ct = default)
    {
        try
        {
            _logger.LogInformation("Начало удаление истекших API ключей {Time}", DateTime.UtcNow);

            var expiredKeys = await _context.ApiKeys
                .Where(x => x.RevokedAt <= DateTime.UtcNow)
                .ToListAsync(ct);

            if (!expiredKeys.Any())
            {
                _logger.LogInformation("Истекшие API ключи не найдены");
                return;
            }

            _context.ApiKeys.RemoveRange(expiredKeys);
            await _context.SaveChangesAsync(ct);

            _logger.LogInformation("Удалено {Count} истекших API ключей", expiredKeys.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Ошибка при очистке истекших API ключей");
            throw;
        }
    }
}
