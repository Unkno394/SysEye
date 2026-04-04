using Infrastructure.Options;
using Serilog;
using Serilog.Events;

namespace Web.Extensions.Configuration;

public static class SerilogConfigurationExtension
{
    public static IHostBuilder UseCustomLogging(this IHostBuilder hostBuilder)
    {
        hostBuilder.UseSerilog((context, config) =>
        {
            var options = context.Configuration.GetSection("LoggingOptions").Get<LoggingOptions>();

            options ??= new LoggingOptions();

            var logLevel = Enum.Parse<LogEventLevel>(options.LogLevel);
            config.MinimumLevel.Is(logLevel);

            if (options.ConsoleEnabled)
            {
                config.WriteTo.Console(
                    outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}"
                );
            }
            if (options.FileEnabled)
            {
                config.WriteTo.File(
                    path: options.LogPath,
                    rollingInterval: RollingInterval.Day,
                    retainedFileCountLimit: 7,
                    outputTemplate: "{Timestamp:yyyy-MM-dd HH:mm:ss.fff zzz} [{Level:u3}] {Message:lj}{NewLine}{Exception}"
                );
            }

            config.Enrich.FromLogContext();
        });

        return hostBuilder;
    }
}
