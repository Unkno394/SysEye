using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class VerificationOptionsValidator : IValidateOptions<VerificationOptions>
{
    public ValidateOptionsResult Validate(string name, VerificationOptions options)
    {
        var errors = new List<string>();

        if (options.EmailTokenExpirationMinutes <= 0)
            errors.Add("EmailTokenExpirationMinutes должен быть больше 0");

        if (options.PasswordTokenExpirationMinutes <= 0)
            errors.Add("PasswordTokenExpirationMinutes должен быть больше 0");

        if (options.EmailTokenLength <= 0)
            errors.Add("EmailTokenLength должен быть больше 0");

        if (options.PasswordTokenLength <= 0)
            errors.Add("PasswordTokenLength должен быть больше 0");

        return errors.Any()
            ? ValidateOptionsResult.Fail(string.Join("; ", errors))
            : ValidateOptionsResult.Success;
    }
}
