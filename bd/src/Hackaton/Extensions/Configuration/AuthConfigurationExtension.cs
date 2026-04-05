using Infrastructure.DbContexts;
using Infrastructure.Options;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace Web.Extensions.Configuration;

public static class AuthConfigurationExtension
{
    public static IHostApplicationBuilder AddAuth(this IHostApplicationBuilder builder)
    {
        var options = builder.Services.BuildServiceProvider()
         .GetRequiredService<IOptions<JwtOptions>>().Value;

        builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, opt =>
            {
                opt.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        context.Token = context.Request.Cookies[options.AccessCookieName];
                        return Task.CompletedTask;
                    },
                    OnTokenValidated = async context =>
                    {
                        var userIdValue = context.Principal?.FindFirst(options.UserIdCookieName)?.Value;
                        var sessionIdValue = context.Principal?.FindFirst(options.SessionCookieName)?.Value;

                        if (!Guid.TryParse(userIdValue, out var userId) || !Guid.TryParse(sessionIdValue, out var sessionId))
                        {
                            context.Fail("Требуется авторизация");
                            return;
                        }

                        var dbContext = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                        var isSessionValid = await dbContext.UserSessions
                            .AsNoTracking()
                            .AnyAsync(
                                session => session.Id == sessionId
                                           && session.UserId == userId
                                           && session.IsActive
                                           && !session.User.IsDeleted
                                           && !session.User.IsBanned,
                                context.HttpContext.RequestAborted);

                        if (!isSessionValid)
                        {
                            context.Fail("Сессия больше не активна");
                        }
                    }
                };

                opt.TokenValidationParameters = new()
                {
                    ValidateAudience = true,
                    ValidAudiences = new[] { options.Audience },

                    ValidateIssuer = true,
                    ValidIssuers = new[] { options.Issuer },

                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(options.Secret)),
                    RequireSignedTokens = true,

                    RequireExpirationTime = true,
                    ValidateLifetime = true,
                };
            });
        builder.Services.AddAuthorization();

        return builder;
    }
}
