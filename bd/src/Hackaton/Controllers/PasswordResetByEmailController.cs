using API.Contracts.Requests;
using Application.Interfaces;
using Infrastructure.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;

namespace Web.Controllers;

[Route("api/password/recovery")]
public class PasswordResetByEmailController(
    IOptions<JwtOptions> options,
    IResetPasswordByEmailService resetPasswordByEmailService) : ControllerBase
{
    private JwtOptions _jwtOptions = options.Value;

    /// <summary>
    /// Отправляет на почту код для сброса пароля
    /// </summary>
    [HttpGet("[action]")]
    public async Task<IActionResult> Email([FromQuery] string email, CancellationToken ct)
    {
        await resetPasswordByEmailService.SendToken(email, ct);
        return Ok();
    }

    [HttpPost("[action]")]
    public async Task<IActionResult> Validate([FromBody] ResetPasswordByEmailRequest request,
        CancellationToken ct)
    {
        var jwtToken = await resetPasswordByEmailService.ValidateToken(request.Token, request.Email, ct);

        Response.Cookies.Append(_jwtOptions.ResetPasswordCookieName, jwtToken, new CookieOptions
        {
            IsEssential = true,
            Secure = true,
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            MaxAge = TimeSpan.FromMinutes(_jwtOptions.ResetPasswordTokenExpirationMinutes)
        });

        return Ok();
    }
}