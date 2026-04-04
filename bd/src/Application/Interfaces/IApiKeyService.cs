using Application.DTO;

namespace Application.Interfaces;

public interface IApiKeyService
{
    Task<ApiKeyDto> Generate(Guid agentId, int daysToRevoke, CancellationToken ct);
    Task<Guid?> GetOwnerIdByApiKey(string apiKey, CancellationToken ct = default);
    Task<bool> Validate(string apiKey, CancellationToken ct = default);
    Task Revoke(Guid id, Guid agentId, CancellationToken ct);
    Task<ApiKeySmallDto> GetKey(Guid agentId, CancellationToken ct);
}
