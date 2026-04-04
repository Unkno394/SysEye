using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Domain.Models;
using Infrastructure.DbContexts;
using Infrastructure.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace Application.Services
{
    public class AuthService(
        AppDbContext context,
        IJwtProvider jwtProvider,
        IPasswordHasher passwordHasher) : IAuthService
    {
        public async Task Register(
            string name,
            string login,
            string password,
            string? email = null,
            CancellationToken ct = default)
        {
            email = email?.ToLower().Trim() ?? string.Empty;
            login = login?.ToLower().Trim() ?? string.Empty;

            var user = await context.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Login == login
                                          || u.Email == email, ct);

            if (user != null)
                throw new ConflictException("Пользователь с таким логином и/или почтой уже существует");

            var newUser = new User
            {
                Name = name.Trim(),
                Login = login,
                PasswordHash = passwordHasher.Hash(password),
            };
            newUser.ChangeEmail(email);

            await context.Users.AddAsync(newUser, ct);
            await context.SaveChangesAsync(ct);
        }

        public async Task<JwtTokens> Login(string? login,
            string password,
            CancellationToken ct = default)
        {
            if (string.IsNullOrWhiteSpace(login))
                throw new BadRequestException("Логин не должен быть пустым");

            login = login.ToLower().Trim() ?? string.Empty;

            var user = await context.Users.FirstOrDefaultAsync(u => (u.Login == login)
                                                                    || (u.Email == login), ct);

            if (user == null) throw new NotFoundException("Неверный логин или пароль");

            if (!passwordHasher.Verify(password, user.PasswordHash))
                throw new BadRequestException("Неверный пароль");

            var session = new Session
            {
                UserId = user.Id,
            };

            var token = new Token
            {
                SessionId = session.Id,
            };

            var tokens = new JwtTokens
            {
                AccessToken = jwtProvider.GenerateAccessToken(user.Id, session.Id, user.Role),
                RefreshToken = jwtProvider.GenerateRefreshToken(user.Id, session.Id)
            };

            token.RefreshToken = tokens.RefreshToken;

            session.Token = token;

            await context.UserSessions.AddAsync(session, ct);
            await context.UserTokens.AddAsync(token, ct);

            await context.SaveChangesAsync(ct);

            return tokens;
        }

        public async Task Logout(Guid sessionId,
            CancellationToken ct = default)
        {
            var session = await context.UserSessions.FirstOrDefaultAsync(s => s.Id == sessionId, ct);

            if (session == null) throw new NotFoundException("Такой сесиии не существует");

            session.IsActive = false;
            session.LastActivity = DateTime.UtcNow;
            session.LogoutDate = DateTime.UtcNow;
            await context.SaveChangesAsync(ct);
        }

        public async Task<JwtTokens> Refresh(string refreshToken,
            Guid userId,
            Guid sessionId,
            CancellationToken ct)
        {
            var user = await context.Users.AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == userId, ct);

            if (user == null)
                throw new NotFoundException("Такого пользователя не существует");

            if (user.IsDeleted || user.IsBanned)
                throw new BadRequestException("Пользователь удален или заблокирован");

            var session = await context.UserSessions
                .Include(s => s.Token)
                .Include(s => s.User)
                .FirstOrDefaultAsync(s => s.Id == sessionId, ct);

            if (session == null)
                throw new NotFoundException("Такой сессии не существует");

            if (session.Token == null)
                throw new NotFoundException("Токен сессии не найден");

            if (session.Token?.RefreshToken != refreshToken)
            {
                session.IsActive = false;
                await context.SaveChangesAsync(ct);
                throw new TeapotException("Обнаружена подмена токена :)");
            }

            if (session.User.IsBanned)
                throw new BadRequestException("Пользователь заблокирован");

            if (!session.IsActive)
                throw new BadRequestException("Данная сессия не активна");

            var nextRefreshToken = jwtProvider.GenerateRefreshToken(userId, sessionId);

            var tokens = new JwtTokens
            {
                AccessToken = jwtProvider.GenerateAccessToken(userId, sessionId, user.Role),
                RefreshToken = nextRefreshToken
            };

            session.Token.RefreshToken = nextRefreshToken;
            session.Token.IsRevoked = false;
            session.LastActivity = DateTime.UtcNow;

            await context.SaveChangesAsync(ct);
            return tokens;
        }
    }
}
