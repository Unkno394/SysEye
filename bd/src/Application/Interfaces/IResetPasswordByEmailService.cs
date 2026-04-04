namespace Application.Interfaces;

public interface IResetPasswordByEmailService
{
    Task SendToken(string email, CancellationToken ct);
    Task<string> ValidateToken(string token,string email, CancellationToken ct);
}