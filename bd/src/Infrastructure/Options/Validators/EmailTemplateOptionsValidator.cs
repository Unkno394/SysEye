using Infrastructure.Email;
using Microsoft.Extensions.Options;
using static Infrastructure.Email.EmailTemplateBuilder;

namespace Infrastructure.Options.Validators;

public class EmailTemplateOptionsValidator : IValidateOptions<EmailTemplateOptions>
{
    public ValidateOptionsResult Validate(string name, EmailTemplateOptions options)
    {
        if (string.IsNullOrEmpty(options.ResourcesPath))
            return ValidateOptionsResult.Fail("ResourcesPath не может быть пустым");

        if (string.IsNullOrEmpty(options.EmailTemplateWithCodeFileName))
            return ValidateOptionsResult.Fail("EmailTemplateWithCodeFileName не может быть пустым");

        if (!Directory.Exists(options.ResourcesPath))
            return ValidateOptionsResult.Fail($"Папка не существует: {options.ResourcesPath}");

        var templatePath = Path.Combine(options.ResourcesPath, options.EmailTemplateWithCodeFileName);

        if (!File.Exists(templatePath))
            return ValidateOptionsResult.Fail($"Файл шаблона не найден: {templatePath}");

        foreach (EmailType emailType in Enum.GetValues(typeof(EmailType)))
        {
            var validationResult = ValidateEmailTypeFiles(options, emailType);
            if (validationResult.Failed)
                return validationResult;
        }

        return ValidateOptionsResult.Success;
    }

    private ValidateOptionsResult ValidateEmailTypeFiles(
        EmailTemplateOptions options,
        EmailType emailType)
    {
        var typeStr = emailType.ToString();
        var missingFiles = new List<string>();

        var filesToCheck = new[]
        {
            $"TITLE-{typeStr}.txt",
            $"DESCRIPTION-{typeStr}.txt"
        };

        foreach (var file in filesToCheck)
        {
            var path = Path.Combine(options.ResourcesPath, file);
            if (!File.Exists(path))
                missingFiles.Add(file);

        }

        if (missingFiles.Any())
            return ValidateOptionsResult.Fail($"Для типа письма '{typeStr}' отсутствуют файлы: " +
                $"{string.Join(", ", missingFiles)}");

        return ValidateOptionsResult.Success;
    }
}
