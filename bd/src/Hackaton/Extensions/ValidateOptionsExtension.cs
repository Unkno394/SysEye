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
                    options.Secret = GetSecret(configuration, "JWT_SECRET", "jwt_secret")
                        ?? options.Secret;
                })
                .ValidateOnStart();

            services.AddOptions<SmtpOptions>()
                .Bind(configuration.GetSection("SmtpOptions"))
                .PostConfigure(options =>
                {
                    options.Email = GetSecret(configuration, "EMAIL", "email")
                        ?? options.Email;

                    options.Password = GetSecret(configuration, "EMAIL_PASSWORD", "email_password")
                        ?? options.Password;
                })
                .ValidateOnStart();

            services.AddOptions<EmailTemplateOptions>()
                .Bind(configuration.GetSection("EmailTemplateOptions"))
                .ValidateOnStart();

            services.AddOptions<LokiOptions>()
                .Bind(configuration.GetSection("LokiOptions"))
                .ValidateOnStart();

            services.AddOptions<OpenTelemetryOptions>()
                .Bind(configuration.GetSection("OpenTelemetryOptions"))
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

            services.AddOptions<TelegramBotNotificationsOptions>()
                .Bind(configuration.GetSection("TelegramBotNotificationsOptions"))
                .ValidateOnStart();

            services.AddOptions<ConnectionStringsOptions>()
                .Bind(configuration.GetSection("ConnectionOptions"))
                .PostConfigure(options =>
                {
                    options.DatabasePassword = GetSecret(configuration, "DB_PASSWORD", "db_password")
                        ?? options.DatabasePassword;

                    options.RedisPassword = GetSecret(configuration, "REDIS_PASSWORD", "redis_password")
                        ?? options.RedisPassword;
                })
                .ValidateOnStart();

            return builder;
        }

        private static string? GetSecret(IConfiguration configuration, string envKey, string dockerSecretKey)
        {
            return Environment.GetEnvironmentVariable(envKey)
                ?? configuration[envKey]
                ?? configuration[dockerSecretKey];
        }

        public static IHostApplicationBuilder ValidateOptions(this IHostApplicationBuilder builder)
        {
            builder.Services.AddSingleton<IValidateOptions<OpenTelemetryOptions>, OpenTelemetryOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<LokiOptions>, LokiOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<ApiKeyOptions>, ApiKeyOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<JwtOptions>, JwtOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<SmtpOptions>, SmtpOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<EmailTemplateOptions>, EmailTemplateOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<LoggingOptions>, LoggingOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<VerificationOptions>, VerificationOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<ConnectionStringsOptions>, ConnectionStringsOptionsValidator>();
            builder.Services.AddSingleton<IValidateOptions<TelegramBotNotificationsOptions>, TelegramBotNotificationsOptionsValidator>();

            return builder;
        }
    }
}
