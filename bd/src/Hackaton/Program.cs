using Web.Extensions;
using Web.Extensions.Configuration;
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

        builder.AddAuth();

        builder.AddDb();
        builder.AddRedis();

        builder.AddHangfire();

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

        app.UseHttpsRedirection();
        app.UseStaticFiles();
        app.MapControllers();
        app.MapDefaultControllerRoute();

        app.ApplyMigrations();

        app.Run();
    }
}