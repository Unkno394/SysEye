using Hangfire;
using Hangfire.Dashboard;
using Hangfire.PostgreSql;
using Infrastructure.BackgroundJobs;
using Infrastructure.Options;
using Microsoft.Extensions.Options;
using Web.Extensions.Configuration;

namespace Web.Extensions.Configuration;

public static class HangfireConfigurationExtension
{
    public static IHostApplicationBuilder AddHangfire(
        this IHostApplicationBuilder builder)
    {
        var connectionString = builder.Services.BuildServiceProvider()
         .GetRequiredService<IOptions<ConnectionStringsOptions>>().Value;

        builder.Services.AddHangfire(config =>
            config.UsePostgreSqlStorage(connectionString.DatabaseConnectionString));

        builder.Services.AddHangfireServer();

        builder.Services.AddScoped<IBackgroundJobService, HangfireJobService>();

        return builder;
    }

    public static IApplicationBuilder UseHangfireDashboard(this IApplicationBuilder app,
        bool useAuthorization = false)
    {
        var options = new DashboardOptions
        {
            DashboardTitle = "Jobs Dashboard",
            DarkModeEnabled = true,
            Authorization = useAuthorization
                ? new[] { new HangfireAuthorizationFilter() }
                : Array.Empty<IDashboardAuthorizationFilter>()
        };

        app.UseHangfireDashboard("/jobs", options);

        return app;
    }

    public static IServiceCollection AddRecurringJobs(this IServiceCollection services)
    {
        services.AddSingleton<IHostedService, RecurringJobsSetup>();
        return services;
    }
}
