using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class OpenTelemetryOptionsValidator : IValidateOptions<OpenTelemetryOptions>
{
    public ValidateOptionsResult Validate(string name, OpenTelemetryOptions options)
    {
        if (string.IsNullOrEmpty(options.Endpoint))
            return ValidateOptionsResult.Fail("Endpoint обязателен");

        if (!Uri.IsWellFormedUriString(options.Endpoint, UriKind.Absolute))
            return ValidateOptionsResult.Fail("Endpoint должен быть корректным URL");

        return ValidateOptionsResult.Success;
    }
}