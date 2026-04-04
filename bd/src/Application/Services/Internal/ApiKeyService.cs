using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Infrastructure.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.Services.Internal;

public class ApiKeyService(AppDbContext context,
    IVerificationTokenProvider verificationTokenProvider) : IApiKeyService
{
    public async Task<ApiKeyDto> Generate(Guid agentId, int daysToRevoke, CancellationToken ct)
    {
        var ownerId = await context.Agents.AsNoTracking()
            .Where(agent => agent.Id == agentId && !agent.IsDeleted)
            .Select(agent => (Guid?)agent.UserId)
            .FirstOrDefaultAsync(ct);

        if (!ownerId.HasValue)
            throw new NotFoundException("Агент не найден");

        var key = new ApiKey
        {
            AgentId = agentId,
            UserId = ownerId.Value,
            RevokedAt = DateTime.UtcNow.AddDays(daysToRevoke),
            Value = verificationTokenProvider.GenerateApiKey()
        };

        await context.ApiKeys.AddAsync(key, ct);
        await context.SaveChangesAsync();

        return new ApiKeyDto
        {
            Id = key.Id,
            Value = key.Value,
        };
    }

    public async Task<bool> Validate(string apiKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return false;

        var key = await context.ApiKeys.AsNoTracking()
            .Where(a => a.Value == apiKey
                && a.RevokedAt.HasValue
                && a.RevokedAt > DateTime.UtcNow)
            .FirstOrDefaultAsync(ct);

        if (key == null) return false;
        return true;
    }

    public async Task<Guid?> GetOwnerIdByApiKey(string apiKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        return await context.ApiKeys.AsNoTracking()
            .Where(a => a.Value == apiKey && a.RevokedAt.HasValue && a.RevokedAt > DateTime.UtcNow)
            .Select(a => a.AgentId.HasValue
                ? (Guid?)a.Agent!.UserId
                : a.UserId)
            .FirstOrDefaultAsync(ct);
    }

    public async Task Revoke(Guid id, Guid agentId, CancellationToken ct)
    {
        await context.ApiKeys
            .Where(a => a.Id == id && a.AgentId == agentId)
            .ExecuteDeleteAsync(ct);
    }

    public async Task<ApiKeySmallDto> GetKey(Guid agentId, CancellationToken ct)
    {
        var key = await context.ApiKeys.AsNoTracking()
            .Where(a => a.AgentId == agentId)
            .Select(a => new ApiKeySmallDto
            {
                Id = a.Id,
                RevokedAt = a.RevokedAt ?? DateTime.MinValue,
            })
            .FirstOrDefaultAsync(ct);

        if (key == null) throw new NotFoundException("Ключ не существует");

        return key;
    }
}
