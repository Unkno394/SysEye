namespace Application.Interfaces
{
    public interface IEmailConfirmService
    {
        Task ConfirmEmail(Guid userId, string inputToken, CancellationToken ct);
        Task SendToken(Guid userId, CancellationToken ct);
    }
}