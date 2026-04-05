using Application.Interfaces;
using Infrastructure.Services;
using QuestPDF.Infrastructure;
using Web.Extensions;
using Web.Extensions.Configuration;
using Web.Hubs;
using Web.Middlewares;
using Web.Middlewares.Web.Middlewares;

namespace Hackaton;

public class Program
{
    public static async Task Main(string[] args)
    {
        var builder = WebApplication.CreateBuilder(args);
        builder.Configuration.AddEnvironmentVariables();
        builder.Configuration.AddKeyPerFile("/run/secrets", optional: true, reloadOnChange: true);
        builder.AddOptions();
        builder.ValidateOptions();

        builder.Services.AddRouting(options =>
        {
            options.LowercaseUrls = true;
        });

        builder.Services.AddControllers();
        builder.Services.AddEndpointsApiExplorer();
        builder.Services.AddSwaggerGen();
        builder.Services.AddXmlCommentsToSwagger();

        builder.Services.AddSignalR();

        builder.AddAuth();

        builder.AddDb();
        builder.AddRedis();

        builder.AddHangfire();
        builder.Services.AddRecurringJobs();

        builder.Services.AddInfrastructure();
        builder.Services.AddServices();

        builder.Services.AddLokiLogReader(builder.Configuration);

        builder.Services.AddBackgroundJobs();
        builder.Host.UseCustomLogging();
        builder.AddClaimsPrincipalExtension();
        builder.Services.AddCoreAdmin(builder.Environment.IsDevelopment() ? string.Empty : "Admin");
        QuestPDF.Settings.License = LicenseType.Community;

        builder.Services.AddCors(options =>
        {
            options.AddPolicy("AllowSpecificOrigin",
                policy =>
                {
                    policy.WithOrigins(builder.Configuration
                            .GetValue<string>("AllowedOrigins")
                            ?.Split(',', StringSplitOptions.RemoveEmptyEntries)
                            ?? Array.Empty<string>())
                        .AllowCredentials()
                        .AllowAnyHeader()
                        .AllowAnyMethod();
                });
        });

        var app = builder.Build();

        app.LogConfigurationAsJson();

        app.UseMiddleware<OptionsMiddleware>();

        app.UseCors("AllowSpecificOrigin");

        app.UseRouting();

        var webSocketOptions = new WebSocketOptions
        {
            KeepAliveInterval = TimeSpan.FromSeconds(120)
        };
        app.UseWebSockets(webSocketOptions);

        app.UseMiddleware<ExceptionHandlingMiddleware>();

        app.UseAuthentication();
        app.UseAuthorization();

        app.UseHangfireDashboard(builder.Environment.IsProduction());

        if (builder.Configuration.GetValue<bool>("SwaggerEnabled"))
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        app.UseHttpsRedirection();
        app.UseStaticFiles();
        app.MapControllers();
        app.MapDefaultControllerRoute();

        app.MapHub<AgentHub>("/agentHub");
        app.MapHub<ClientHub>("/clientHub");

        app.ApplyMigrations();

        app.Run();
    }
}