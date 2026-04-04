namespace Infrastructure.Options;

public class VerificationOptions
{
    public int EmailTokenExpirationMinutes { get; set; }
    public int EmailTokenLength { get; set; }

    public int PasswordTokenExpirationMinutes { get; set; }
    public int PasswordTokenLength { get; set; }
}
