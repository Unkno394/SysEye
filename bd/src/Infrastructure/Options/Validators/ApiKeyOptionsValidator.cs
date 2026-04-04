using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class ApiKeyOptionsValidator : IValidateOptions<ApiKeyOptions>
{
    public ValidateOptionsResult Validate(string name, ApiKeyOptions options)
    {
        if (string.IsNullOrEmpty(options.ApiKeyHeader))
            return ValidateOptionsResult.Fail("ApiKeyHeader обязателен");

        if (string.IsNullOrEmpty(options.AgentIdHeader))
            return ValidateOptionsResult.Fail("AgentIdHeader обязателен");

        return ValidateOptionsResult.Success;
    }
}