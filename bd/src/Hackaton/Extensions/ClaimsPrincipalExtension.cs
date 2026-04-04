using Domain.Exceptions;
using Infrastructure.Options;
using Microsoft.Extensions.Options;
using System.Security.Claims;

namespace Web.Extensions;

public static class ClaimsPrincipalExtension
{
    private static JwtOptions _jwtOptions = null!;

    public static IHostApplicationBuilder AddClaimsPrincipalExtension(this IHostApplicationBuilder builder)
    {
        _jwtOptions = builder.Services.BuildServiceProvider()
            .GetRequiredService<IOptions<JwtOptions>>().Value;

        return builder;
    }

    public static Guid GetUserId(this ClaimsPrincipal user)
    {
        try
        {
            return Guid.Parse(user.FindFirstValue(_jwtOptions.UserIdCookieName));
        }
        catch { throw new UnauthorizedException("Требуется авторизация"); }
    }

    public static string GetEmail(this ClaimsPrincipal user)
    {
        return user.FindFirstValue(ClaimTypes.Email);
    }

    public static Guid GetSessionId(this ClaimsPrincipal user)
    {
        try
        {
            return Guid.Parse(user.FindFirstValue(_jwtOptions.SessionCookieName));
        }
        catch
        {
            throw new UnauthorizedException("Требуется авторизация");
        }
    }
}
