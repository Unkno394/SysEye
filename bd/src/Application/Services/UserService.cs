using Application.DTO;
using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.DbContexts;
using Microsoft.EntityFrameworkCore;

namespace Application.Services;

public class UserService(AppDbContext context) : IUserService
{
    public async Task<UserInfo?> GetInfo(Guid userId, CancellationToken ct = default)
    {
        var userInfo = await context.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new UserInfo
            {
                Name = u.Name,
                Login = u.Login,
                Email = u.Email,
                Role = u.Role,
                IsEmailConfirmed = u.IsEmailConfirmed
            })
            .FirstOrDefaultAsync(ct);

        if (userInfo == null) throw new NotFoundException("Такого пользователя не существует");

        return userInfo;
    }

    public async Task Rename(Guid userId, string name, CancellationToken ct)
        => await context.Users
            .Where(x => x.Id == userId)
            .ExecuteUpdateAsync(setter => setter.SetProperty(
                x => x.Name, name.Trim()), ct);
}
