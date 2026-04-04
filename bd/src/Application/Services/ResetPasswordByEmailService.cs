using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Application.Services
{
    public class ResetPasswordByEmailService(
        IOptions<VerificationOptions> options,
        IEmailTemplateBuilder emailTemplateBuilder,
        IJwtProvider jwtProvider,
        IRedisCacheService redisCacheService,
        IEmailService emailService,
        IVerificationTokenProvider tokenProvider,
        AppDbContext context,
        ILogger<ResetPasswordByEmailService> logger) : IResetPasswordByEmailService
    {
        private readonly VerificationOptions _options = options.Value;

        public async Task SendToken(string email, CancellationToken ct)
        {
            email = email.ToLower().Trim();

            var user = await context.Users
                .Where(u => u.Email == email)
                .Select(u => new
                {
                    Id = u.Id,
                    IsEmailConfirmed = u.IsEmailConfirmed
                })
                .FirstOrDefaultAsync(ct);

            if (user == null) throw new NotFoundException("Такого пользователя не существует");
            if (!user.IsEmailConfirmed) throw new BadRequestException("Почта данного пользователя не подтверждена");

            var token = tokenProvider.GenerateResetToken(_options.PasswordTokenLength);
            await redisCacheService.SetAsync(email, token);
            logger.LogWarning("Password reset token for {Email}: {Token}", email, token);

            var html = emailTemplateBuilder.BuildResetPasswordEmail(token, _options.PasswordTokenExpirationMinutes);
            await emailService.SendAsync(email, "Смена пароля", html, ct);
        }

        public async Task<string> ValidateToken(string inputToken, string email, CancellationToken ct)
        {
            email = email.ToLower().Trim();

            var user = await context.Users
                .Where(u => u.Email == email)
                .Select(u => new
                {
                    Id = u.Id,
                    IsEmailConfirmed = u.IsEmailConfirmed
                })
                .FirstOrDefaultAsync(ct);

            if (user == null) throw new NotFoundException("Такого пользователя не существует");
            if (!user.IsEmailConfirmed) throw new BadRequestException("Почта данного пользователя не подтверждена");

            var token = await redisCacheService.GetAsync<string>(email);

            if (!string.Equals(token, inputToken, StringComparison.CurrentCultureIgnoreCase))
                throw new BadRequestException("Неверный или истекший токен сброса пароля");

            return jwtProvider.GeneratePasswordResetToken(email);
        }
    }
}
