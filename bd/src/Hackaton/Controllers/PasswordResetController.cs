using API.Contracts.Requests;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Web.Extensions;

namespace Web.Controllers;

[ProducesResponseType(401)]
[Route("api/password")]
public class PasswordResetController(
    IResetPasswordService resetPasswordService,
    IOptions<JwtOptions> options,
    IJwtProvider jwtProvider) : ControllerBase
{

    /// <summary>
    /// Смена пароля из профиля
    /// </summary>
    [Authorize]
    [HttpPost("[action]")]
    public async Task<IActionResult> Change([FromBody] ResetPasswordRequest request,
            CancellationToken ct)
    {
        await resetPasswordService.ResetPassword(User.GetUserId(), request.OldPassword,
            request.NewPassword, ct);
        return Ok("Пароль успешно сменен");
    }

    /// <summary>
    /// Смена пароля по почте
    /// </summary>
    [HttpPost("[action]")]
    public async Task<IActionResult> Reset(
        [FromBody] ResetPasswordByTokenRequest? request,
        [FromQuery] string? password,
        CancellationToken ct)
    {
        var refreshToken = Request.Cookies[options.Value.ResetPasswordCookieName];

        if (string.IsNullOrEmpty(refreshToken)) return Unauthorized("Как ты сюда попал?");

        var principal = jwtProvider.ValidatePasswordResetToken(refreshToken);
        if (principal == null) return Unauthorized("Токен не корректен");

        var email = principal.GetEmail();
        if (string.IsNullOrEmpty(email)) return BadRequest("Токен не корректен: отсутвует email");

        var newPassword = request?.NewPassword;
        if (string.IsNullOrWhiteSpace(newPassword))
            newPassword = password;

        if (string.IsNullOrWhiteSpace(newPassword))
            return BadRequest("Новый пароль обязателен");

        await resetPasswordService.ResetPassword(email, newPassword, ct);

        return Ok();
    }
}
