using Microsoft.Extensions.Options;

namespace Infrastructure.Options.Validators;

public class TelegramBotNotificationsOptionsValidator : IValidateOptions<TelegramBotNotificationsOptions>
{
    public ValidateOptionsResult Validate(string? name, TelegramBotNotificationsOptions options)
    {
        if (options.TimeoutSeconds <= 0)
            return ValidateOptionsResult.Fail("TelegramBotNotificationsOptions.TimeoutSeconds должен быть больше 0");

        if (!options.Enabled)
            return ValidateOptionsResult.Success;

        if (string.IsNullOrWhiteSpace(options.Endpoint))
            return ValidateOptionsResult.Fail("TelegramBotNotificationsOptions.Endpoint обязателен, когда интеграция включена");

        if (!Uri.TryCreate(options.Endpoint, UriKind.Absolute, out _))
            return ValidateOptionsResult.Fail("TelegramBotNotificationsOptions.Endpoint должен быть абсолютным URL");

        if (string.IsNullOrWhiteSpace(options.SecretHeaderName))
            return ValidateOptionsResult.Fail("TelegramBotNotificationsOptions.SecretHeaderName обязателен");

        return ValidateOptionsResult.Success;
    }
}
