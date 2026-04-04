using Application.DTO;
using Application.Interfaces;
using Domain.Models;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;

namespace Application.Services.Internal;

public class ApiKeyService(AppDbContext context) : IApiKeyService
{
    public async Task<ApiKeyDto> Generate(string name, Guid userId, CancellationToken ct)
    {
        var key = new ApiKey
        {
            Name = name,
            UserId = userId,
            Value = GenerateApiKeyValue(),
        };

        await context.ApiKeys.AddAsync(key, ct);
        await context.SaveChangesAsync();

        return new ApiKeyDto
        {
            Id = key.Id,
            Value = key.Value,
            Name = name
        };
    }

    public async Task<bool> Validate(string apiKey, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return false;

        var key = await context.ApiKeys.AsNoTracking()
            .Where(a => a.Value == apiKey
                        && !a.IsRevoked && !a.IsDeleted)
            .FirstOrDefaultAsync(ct);

        if (key == null) return false;
        return true;
    }

    public async Task<Guid?> GetOwnerId(string apiKey, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(apiKey)) return null;

        return await context.ApiKeys.AsNoTracking()
            .Where(a => a.Value == apiKey
                        && !a.IsRevoked
                        && !a.IsDeleted)
            .Select(a => (Guid?)a.UserId)
            .FirstOrDefaultAsync(ct);
    }

    public async Task Revoke(Guid id, Guid userid, CancellationToken ct)
    {
        await context.ApiKeys
            .Where(a => a.Id == id && a.UserId == userid)
            .ExecuteUpdateAsync(setters =>
                setters.SetProperty(a => a.IsRevoked, true), ct);
    }

    public async Task<IEnumerable<ApiKeyDto>> GetKeys(Guid userId, CancellationToken ct)
        => await context.ApiKeys.AsNoTracking()
            .Where(a => a.UserId == userId)
            .Select(a => new ApiKeyDto
            {
                Id = a.Id,
                Name = a.Name,
                Value = a.Value,
            })
            .ToListAsync(ct);

    private static string GenerateApiKeyValue()
    {
        var bytes = RandomNumberGenerator.GetBytes(32);
        return Convert.ToBase64String(bytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .TrimEnd('=');
    }
}
