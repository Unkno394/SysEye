using Domain.Models;
using System.Security.Claims;

namespace Infrastructure.Interfaces
{
    public interface IJwtProvider
    {
        string GenerateAccessToken(Guid userId, Guid sessionId, Role role);
        string GenerateRefreshToken(Guid userId, Guid sessionId);
        string GeneratePasswordResetToken(string email);

        ClaimsPrincipal? ValidatePasswordResetToken(string token);
        ClaimsPrincipal? ValidateRefreshToken(string token);
    }
}
