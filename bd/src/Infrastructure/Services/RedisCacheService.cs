using Infrastructure.Interfaces;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace Infrastructure.Services
{
    public class RedisCacheService(
        IDistributedCache cache,
        ILogger<RedisCacheService> logger) : IRedisCacheService
    {
        private readonly JsonSerializerOptions _jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            PropertyNameCaseInsensitive = true
        };

        public async Task<T> GetAsync<T>(string key, CancellationToken ct = default)
        {
            var bytes = await cache.GetAsync(key, ct);
            if (bytes == null)
                return default;

            var json = System.Text.Encoding.UTF8.GetString(bytes);
            return JsonSerializer.Deserialize<T>(json, _jsonOptions);
        }

        public async Task SetAsync<T>(string key, T value, TimeSpan? expiry = null,
            CancellationToken ct = default)
        {
            var options = new DistributedCacheEntryOptions();

            if (expiry.HasValue)
                options.SetAbsoluteExpiration(expiry.Value);
            else
                options.SetSlidingExpiration(TimeSpan.FromMinutes(20));

            var json = JsonSerializer.Serialize(value, _jsonOptions);
            var bytes = System.Text.Encoding.UTF8.GetBytes(json);

            await cache.SetAsync(key, bytes, options, ct);

            logger.LogInformation("Кэш установлен для ключа: {Key}", key);
        }

        public async Task RemoveAsync(string key, CancellationToken ct)
        {
            await cache.RemoveAsync(key, ct);
            logger.LogInformation("Кэш удален для ключа: {Key}", key);
        }

        public async Task<T> GetOrSetAsync<T>(string key, Func<Task<T>> factory,
            TimeSpan? expiry = null, CancellationToken ct = default)
        {
            var cached = await GetAsync<T>(key);
            if (cached != null)
            {
                return cached;
            }

            var value = await factory();
            if (value != null)
            {
                await SetAsync(key, value, expiry, ct);
            }

            return value;
        }

        public async Task RefreshAsync(string key, CancellationToken ct)
        {
            await cache.RefreshAsync(key, ct);
        }
    }
}
