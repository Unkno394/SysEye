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
        AddLocalSecrets(builder);
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
        builder.Services.AddBackgroundJobs();
        builder.Host.UseCustomLogging();
        builder.AddClaimsPrincipalExtension();
        builder.Services.AddCoreAdmin(builder.Environment.IsDevelopment() ? string.Empty : "Admin");

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
        app.UseMiddleware<ApiKeyMiddleware>();

        app.UseAuthentication();
        app.UseAuthorization();

        app.UseHangfireDashboard(builder.Environment.IsProduction());

        if (builder.Configuration.GetValue<bool>("SwaggerEnabled"))
        {
            app.UseSwagger();
            app.UseSwaggerUI();
        }

        if (!app.Environment.IsDevelopment())
        {
            app.UseHttpsRedirection();
        }
        app.UseStaticFiles();
        app.MapControllers();
        app.MapDefaultControllerRoute();

        app.MapHub<AgentHub>("/agentHub");

        app.ApplyMigrations();

        app.Run();
    }

    private static void AddLocalSecrets(WebApplicationBuilder builder)
    {
        var localSecretsPath = Path.GetFullPath(Path.Combine(
            builder.Environment.ContentRootPath,
            "..",
            "..",
            "hackaton",
            "secrets"));

        if (!Directory.Exists(localSecretsPath))
        {
            return;
        }

        var fileToKey = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["db_password.txt"] = "DB_PASSWORD",
            ["redis_password.txt"] = "REDIS_PASSWORD",
            ["jwt_secret.txt"] = "JWT_SECRET",
            ["email.txt"] = "EMAIL",
            ["email_password.txt"] = "EMAIL_PASSWORD"
        };

        var secrets = fileToKey
            .Select(pair => new
            {
                Key = pair.Value,
                FilePath = Path.Combine(localSecretsPath, pair.Key)
            })
            .Where(item => File.Exists(item.FilePath))
            .ToDictionary(
                item => item.Key,
                item => File.ReadAllText(item.FilePath).Trim(),
                StringComparer.OrdinalIgnoreCase);

        if (secrets.Count > 0)
        {
            builder.Configuration.AddInMemoryCollection(secrets);
        }
    }
}
