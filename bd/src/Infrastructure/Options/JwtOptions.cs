namespace Infrastructure.Options;

public class JwtOptions
{
    public string AccessCookieName { get; set; } = string.Empty;
    public string RefreshCookieName { get; set; } = string.Empty;
    public string ResetPasswordCookieName { get; set; } = string.Empty;
    public string UserIdCookieName { get; set; } = string.Empty;
    public string SessionCookieName { get; set; } = string.Empty;
    public string Secret { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int AccessTokenExpirationMinutes { get; set; } = 15;
    public int RefreshTokenExpirationDays { get; set; } = 1;
    public int ResetPasswordTokenExpirationMinutes { get; set; } = 60;
}
