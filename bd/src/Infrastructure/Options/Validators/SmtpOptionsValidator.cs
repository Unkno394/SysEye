using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class SmtpOptionsValidator : IValidateOptions<SmtpOptions>
{
    public ValidateOptionsResult Validate(string name, SmtpOptions options)
    {
        var errors = new List<string>();

        if (string.IsNullOrWhiteSpace(options.Host))
            errors.Add("Host SMTP сервера обязателен");

        if (string.IsNullOrWhiteSpace(options.Email))
            errors.Add("Email отправителя обязателен");

        if (string.IsNullOrWhiteSpace(options.Password))
            errors.Add("Password для SMTP обязателен");

        if (options.UsePortAndSsl)
        {
            if (options.Port <= 0 || options.Port > 65535)
                errors.Add("Port должен быть в диапазоне 1-65535");
        }

        if (options.MaxRetryAttempts < 0)
            errors.Add("MaxRetryAttempts не может быть отрицательным");

        if (options.TimeoutSeconds <= 0)
            errors.Add("TimeoutSeconds должен быть больше 0");

        if (options.RetryDelaySeconds < 0)
            errors.Add("RetryDelaySeconds не может быть отрицательным");

        if (errors.Any())
            return ValidateOptionsResult.Fail(string.Join("; ", errors));

        return ValidateOptionsResult.Success;
    }

}
