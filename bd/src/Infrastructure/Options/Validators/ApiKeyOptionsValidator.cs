using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class ApiKeyOptionsValidator : IValidateOptions<ApiKeyOptions>
{
    public ValidateOptionsResult Validate(string name, ApiKeyOptions options)
    {
        if (string.IsNullOrEmpty(options.Header))
            return ValidateOptionsResult.Fail("Header обязателен");

        return ValidateOptionsResult.Success;
    }
}