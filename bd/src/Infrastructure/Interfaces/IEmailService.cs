namespace Infrastructure.Interfaces
{
    public interface IEmailService
    {
        Task SendAsync(string email, string subject, string text, CancellationToken ct = default);
    }
}