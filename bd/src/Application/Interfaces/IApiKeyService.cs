using Application.DTO;

namespace Application.Interfaces;

public interface IApiKeyService
{
    Task<bool> Validate(string apiKey, CancellationToken ct = default);
    Task<Guid?> GetOwnerId(string apiKey, CancellationToken ct = default);
    Task<ApiKeyDto> Generate(string name, Guid userId, CancellationToken ct);
    Task Revoke(Guid id, Guid userid, CancellationToken ct);
    Task<IEnumerable<ApiKeyDto>> GetKeys(Guid userId, CancellationToken ct);
}
