
namespace Infrastructure.Interfaces
{
    public interface IRedisCacheService
    {
        Task<T> GetAsync<T>(string key, CancellationToken ct = default);
        Task RemoveAsync(string key, CancellationToken ct = default);
        Task<T> GetOrSetAsync<T>(string key, Func<Task<T>> factory, TimeSpan? expiry = null, CancellationToken ct = default);
        Task RefreshAsync(string key, CancellationToken ct = default);
        Task SetAsync<T>(string key, T value, TimeSpan? expiry = null, CancellationToken ct = default);
    }
}
