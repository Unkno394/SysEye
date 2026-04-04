using Application.DTO;

namespace Application.Interfaces
{
    public interface IAuthService
    {
        Task<JwtTokens> Login(string? login, string password, CancellationToken ct = default);
        Task Logout(Guid sessionId, CancellationToken ct = default);
        Task<JwtTokens> Refresh(string refreshToken, Guid userId, Guid sessionId, CancellationToken ct);
        Task Register(string name, string login, string password, string? email = null, CancellationToken ct = default);
    }
}
