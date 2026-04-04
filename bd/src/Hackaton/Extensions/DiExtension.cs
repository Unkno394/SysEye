using Application.Interfaces;
using Application.Services;
using Application.Services.Internal;
using Infrastructure.Auth;
using Infrastructure.BackgroundJobs.Jobs;
using Infrastructure.BackgroundJobs.Jobs.Interfaces;
using Infrastructure.Email;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Infrastructure.Services;
using Microsoft.Extensions.Options;
using Web.Services;

namespace Web.Extensions;

public static class DiExtension
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services)
    {
        services.AddSingleton<IRedisCacheService, RedisCacheService>();

        services.AddScoped<IPasswordHasher, PasswordHasher>();
        services.AddScoped<IJwtProvider, JwtProvider>();

        services.AddScoped<IEmailService, EmailService>();
        services.AddScoped<IEmailTemplateBuilder, EmailTemplateBuilder>();

        services.AddScoped<IVerificationTokenProvider, VerificationTokenProvider>();

        return services;
    }

    public static IServiceCollection AddServices(this IServiceCollection services)
    {
        services.AddScoped<IEmailConfirmService, EmailConfirmService>();

        services.AddScoped<IScenarioService, ScenarioService>();

        services.AddHttpClient<ITaskNotificationPublisher, TaskWebhookNotifier>((serviceProvider, client) =>
        {
            var settings = serviceProvider.GetRequiredService<IOptions<TelegramBotNotificationsOptions>>().Value;
            client.Timeout = TimeSpan.FromSeconds(settings.TimeoutSeconds);
        });

        services.AddScoped<ITaskService, TaskService>();
        services.AddScoped<IAgentCommandDispatcher, AgentCommandDispatcher>();
        services.AddScoped<IRealtimeNotifier, RealtimeNotifier>();

        services.AddScoped<IAgentService, AgentService>();
        services.AddScoped<ICommandService, CommandService>();

        services.AddScoped<IResetPasswordService, ResetPasswordService>();
        services.AddScoped<IResetPasswordByEmailService, ResetPasswordByEmailService>();

        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<IApiKeyService, ApiKeyService>();

        return services;
    }

    public static IServiceCollection AddBackgroundJobs(this IServiceCollection services)
    {
        services.AddScoped<IEmailBackgroundJob, EmailBackgroundJob>();
        services.AddScoped<IApiKeyCleanupJob, ApiKeyCleanupJob>();

        return services;
    }
}
