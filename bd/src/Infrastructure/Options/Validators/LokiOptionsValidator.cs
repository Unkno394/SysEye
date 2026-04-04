using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class LokiOptionsValidator : IValidateOptions<LokiOptions>
{
    public ValidateOptionsResult Validate(string name, LokiOptions options)
    {
        if (string.IsNullOrEmpty(options.BaseUrl))
            return ValidateOptionsResult.Fail("BaseUrl обязателен");

        if (!Uri.IsWellFormedUriString(options.BaseUrl, UriKind.Absolute))
            return ValidateOptionsResult.Fail("BaseUrl должен быть корректным URL");

        if (options.TimeoutSeconds <= 0)
            return ValidateOptionsResult.Fail("TimeoutSeconds должен быть положительным");

        if (options.TimeoutSeconds > 300)
            return ValidateOptionsResult.Fail("TimeoutSeconds не должен превышать 300 секунд");

        return ValidateOptionsResult.Success;
    }
}