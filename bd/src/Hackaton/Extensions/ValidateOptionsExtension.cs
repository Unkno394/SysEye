using Infrastructure.Options;
using Infrastructure.Options.Validators;
using Microsoft.Extensions.Options;

namespace Web.Extensions
{
    public static class ValidateOptionsExtension
    {
        public static IHostApplicationBuilder AddOptions(this IHostApplicationBuilder builder)
        {
            var services = builder.Services;
            var configuration = builder.Configuration;

            services.AddOptions<JwtOptions>()
                .Bind(configuration.GetSection("JwtOptions"))
                .PostConfigure(options =>
                {
                    options.Secret = Environment.GetEnvironmentVariable("JWT_SECRET")
                        ?? configuration["JWT_SECRET"]
                        ?? options.Secret;
                })
                .ValidateOnStart();

            services.AddOptions<SmtpOptions>()
                .Bind(configuration.GetSection("SmtpOptions"))
                .PostConfigure(options =>
                {
                    options.Email = Environment.GetEnvironmentVariable("EMAIL")
                        ?? configuration["EMAIL"]
                        ?? options.Email;

                    options.Password = Environment.GetEnvironmentVariable("EMAIL_PASSWORD")
                    ?? configuration["EMAIL_PASSWORD"]
                    ?? options.Password;
                })
                .ValidateOnStart();

            services.AddOptions<EmailTemplateOptions>()
                .Bind(configuration.GetSection("EmailTemplateOptions"))
                .ValidateOnStart();

            services.AddOptions<LoggingOptions>()
                .Bind(configuration.GetSection("LoggingOptions"))
                .ValidateOnStart();

            services.AddOptions<VerificationOptions>()
                .Bind(configuration.GetSection("VerificationOptions"))
                .ValidateOnStart();

            services.AddOptions<ApiKeyOptions>()
                .Bind(configuration.GetSection("ApiKeyOptions"))
                .ValidateOnStart();

            services.AddOptions<ConnectionStringsOptions>()
                .Bind(configuration.GetSection("ConnectionOptions"))
                .PostConfigure(options =>
                {
                    options.DatabasePassword = Environment.GetEnvironmentVariable("DB_PASSWORD")
                        ?? configuration["DB_PASSWORD"]
                        ?? options.DatabasePassword;

                    options.RedisPassword = Environment.GetEnvironmentVariable("REDIS_PASSWORD")
                        ?? configuration["REDIS_PASSWORD"]
                        ?? options.RedisPassword;
                })
                .ValidateOnStart();

            return builder;
        }

        public static IHostApplicationBuilder ValidateOptions(this IHostApplicationBuilder builder)
        {
            builder.Services.AddSingleton<IValidateOptions<ApiKeyOptions>, ApiKeyOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<JwtOptions>, JwtOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<SmtpOptions>, SmtpOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<EmailTemplateOptions>, EmailTemplateOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<LoggingOptions>, LoggingOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<VerificationOptions>, VerificationOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<ConnectionStringsOptions>, ConnectionStringsOptionsValidator>();

            return builder;
        }
    }
}
