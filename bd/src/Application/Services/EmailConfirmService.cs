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
    public class EmailConfirmService(
        IRedisCacheService redisCacheService,
        IOptions<VerificationOptions> options,
        IEmailTemplateBuilder emailTemplateBuilder,
        IVerificationTokenProvider tokenProvider,
        IEmailService emailService,
        AppDbContext context,
        ILogger<EmailConfirmService> logger) : IEmailConfirmService
    {
        private readonly VerificationOptions _options = options.Value;

        public async Task SendToken(Guid userId, CancellationToken ct)
        {
            var user = await context.Users.AsNoTracking()
                .Where(u => u.Id == userId)
                .Select(u => new
                {
                    Email = u.Email,
                    IsEmailConfirmed = u.IsEmailConfirmed
                })
                .FirstOrDefaultAsync();

            if (user == null) throw new NotFoundException("Такого пользователя не существует");
            if (string.IsNullOrWhiteSpace(user.Email)) throw new BadRequestException("Укажите почту прежде чем ее подтверждать");
            if (user.IsEmailConfirmed) throw new ConflictException("Почта данного пользователя уже подтверждена");

            var token = tokenProvider.GenerateResetToken(_options.EmailTokenLength);
            await redisCacheService.SetAsync(user.Email, token);
            logger.LogWarning("Email confirmation token for {Email}: {Token}", user.Email, token);

            var html = emailTemplateBuilder.BuildEmailConfirmation(token, _options.EmailTokenExpirationMinutes);

            await emailService.SendAsync(user.Email, "Подтверждение почты", html, ct);
        }

        public async Task ConfirmEmail(Guid userId, string inputToken, CancellationToken ct)
        {

            var user = await context.Users
             .Where(u => u.Id == userId)
             .FirstOrDefaultAsync();

            if (user == null) throw new NotFoundException("Такого пользователя не существует");
            if (string.IsNullOrWhiteSpace(user.Email)) throw new BadRequestException("Укажите почту прежде чем ее подтверждать");
            if (user.IsEmailConfirmed) throw new ConflictException("Почта данного пользователя уже подтверждена");

            var token = await redisCacheService.GetAsync<string>(user.Email);

            if (string.Equals(token, inputToken))
            {
                user.ConfirmEmail();
                await context.SaveChangesAsync();
            }
        }
    }
}

