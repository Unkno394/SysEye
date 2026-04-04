using Infrastructure.Email;

namespace Infrastructure.Interfaces;

public interface IEmailTemplateBuilder
{

    EmailData LoadEmailData(EmailType emailType, string code, int expiryTime = 30);
    string BuildEmail(EmailType emailType, EmailData emailData);
    string BuildEmailConfirmation(string code, int expiryTime = 30);
    string BuildResetPasswordEmail(string code, int expiryTime = 30);
}