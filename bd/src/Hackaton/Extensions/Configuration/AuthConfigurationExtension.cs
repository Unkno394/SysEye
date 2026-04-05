using Infrastructure.Options;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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