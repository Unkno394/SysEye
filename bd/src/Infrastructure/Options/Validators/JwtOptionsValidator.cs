using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class JwtOptionsValidator : IValidateOptions<JwtOptions>
{
    public ValidateOptionsResult Validate(string name, JwtOptions options)
    {
        if (string.IsNullOrEmpty(options.AccessCookieName))
            return ValidateOptionsResult.Fail("AccessCookieName обязателен");

        if (string.IsNullOrEmpty(options.RefreshCookieName))
            return ValidateOptionsResult.Fail("RefreshCookieName обязателен");

        if (string.IsNullOrEmpty(options.Issuer))
            return ValidateOptionsResult.Fail("Issuer обязателен");

        if (string.IsNullOrEmpty(options.Audience))
            return ValidateOptionsResult.Fail("Audience обязателен");

        if (string.IsNullOrEmpty(options.Secret))
            return ValidateOptionsResult.Fail("Secret обязателен");

        if (string.IsNullOrEmpty(options.RefreshCookieName))
            return ValidateOptionsResult.Fail("RefreshCookieName обязателен");

        if (options.Secret.Length < 32)
            return ValidateOptionsResult.Fail("Secret должен быть больше 32 символов");

        if (options.AccessTokenExpirationMinutes <= 0)
            return ValidateOptionsResult.Fail("AccessTokenExpirationMinutes должен быть положительным");

        if (options.RefreshTokenExpirationDays <= 0)
            return ValidateOptionsResult.Fail("RefreshTokenExpirationDays должен быть положительным");

        if (options.ResetPasswordTokenExpirationMinutes <= 0)
            return ValidateOptionsResult.Fail("ResetPasswordTokenExpirationMinutes должен быть положительным");

        return ValidateOptionsResult.Success;
    }
}
