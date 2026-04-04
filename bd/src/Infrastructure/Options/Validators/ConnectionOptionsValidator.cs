using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class ConnectionStringsOptionsValidator : IValidateOptions<ConnectionStringsOptions>
{
    public ValidateOptionsResult Validate(string name, ConnectionStringsOptions options)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(options.DatabaseConnectionTemplate))
            errors.Add("DatabaseTemplate не может быть пустым");
        else if (!options.DatabaseConnectionTemplate.Contains("{0}"))
            errors.Add("DatabaseTemplate должен содержать '{0}' для подстановки пароля");

        if (string.IsNullOrWhiteSpace(options.RedisConnectionTemplate))
            errors.Add("RedisTemplate не может быть пустым");
        else if (!options.RedisConnectionTemplate.Contains("{0}"))
            errors.Add("RedisTemplate должен содержать '{0}' для подстановки пароля");

        if (string.IsNullOrWhiteSpace(options.DatabasePassword))
            errors.Add("DatabasePassword не может быть пустым");

        if (string.IsNullOrWhiteSpace(options.RedisPassword))
            errors.Add("RedisPassword не может быть пустым");

        if (string.IsNullOrWhiteSpace(options.RedisInstanceName))
            errors.Add("RedisInstanceName не может быть пустым");

        return errors.Any()
            ? ValidateOptionsResult.Fail(string.Join("; ", errors))
            : ValidateOptionsResult.Success;
    }
}
