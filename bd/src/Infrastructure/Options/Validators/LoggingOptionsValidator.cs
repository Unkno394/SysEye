using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class LoggingOptionsValidator : IValidateOptions<LoggingOptions>
{
    private static readonly string[] ValidLogLevels = new[]
    {
        "Trace", "Debug", "Information", "Warning", "Error", "Critical", "None"
    };

    public ValidateOptionsResult Validate(string name, LoggingOptions options)
    {
        var errors = new List<string>();

        if (!ValidLogLevels.Contains(options.LogLevel, StringComparer.OrdinalIgnoreCase))
        {
            errors.Add($"LogLevel должен быть одним из: {string.Join(", ", ValidLogLevels)}");
        }

        if (options.FileEnabled && string.IsNullOrWhiteSpace(options.LogPath))
            errors.Add("LogPath обязателен при включенном FileEnabled");

        return errors.Any()
            ? ValidateOptionsResult.Fail(string.Join("; ", errors))
            : ValidateOptionsResult.Success;
    }
}
