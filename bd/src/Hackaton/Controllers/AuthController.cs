using API.Contracts.Requests;
using Application.Interfaces;
using Domain.Exceptions;
using Infrastructure.Interfaces;
using Infrastructure.Options;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Web.Extensions;

namespace API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController(
    IAuthService authService,
    IOptions<JwtOptions> options,
    IJwtProvider jwtProvider) : ControllerBase
{
    private readonly JwtOptions _options = options.Value;

    [HttpPost("[action]")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        var tokens = await authService.Login(request.Login,
            request.Password, ct);

        SetTokens(tokens.AccessToken, tokens.RefreshToken);

        return Ok();
    }

    [HttpPost("[action]")]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var sessionIdClaim = User.FindFirst(_options.SessionCookieName)?.Value;
        if (sessionIdClaim == null)
            return BadRequest("Сессия не активна");

        await authService.Logout(Guid.Parse(sessionIdClaim), ct);

        DeleteTokens();

        return Ok();
    }

    [HttpPost("[action]")]
    public async Task<IActionResult> Register([FromBody] RegisterRequest request, CancellationToken ct)
    {
        await authService.Register(request.Name,
            request.Login,
            request.Password,
            request.Email,
            ct);

        return Ok();
    }

    [HttpPost("[action]")]
    public async Task<IActionResult> Refresh(CancellationToken ct)
    {
        var refreshToken = Request.Cookies[_options.RefreshCookieName];

        if (string.IsNullOrEmpty(refreshToken))
        {
            DeleteTokens();
            return Unauthorized("Сессия не активна");
        }

        var principal = jwtProvider.ValidateRefreshToken(refreshToken);
        if (principal == null)
        {
            DeleteTokens();
            return Unauthorized("Рефреш токен не корректен");
        }

        var userId = principal.GetUserId();
        var sessionId = principal.GetSessionId();

        try
        {
            var tokens = await authService.Refresh(refreshToken, userId, sessionId, ct);

            SetTokens(tokens.AccessToken, tokens.RefreshToken);

            return Ok();
        }
        catch (Exception ex) when (
            ex is UnauthorizedException
            or NotFoundException
            or BadRequestException
            or TeapotException)
        {
            DeleteTokens();
            return Unauthorized(ex.Message);
        }
    }

    private void SetTokens(string accessToken, string refreshToken)
    {
        Response.Cookies.Append(_options.AccessCookieName, accessToken, new CookieOptions
        {
            IsEssential = true,
            Secure = true,
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            MaxAge = TimeSpan.FromMinutes(_options.AccessTokenExpirationMinutes)
        });
        Response.Cookies.Append(_options.RefreshCookieName, refreshToken, new CookieOptions
        {
            IsEssential = true,
            Secure = true,
            HttpOnly = true,
            SameSite = SameSiteMode.Strict,
            MaxAge = TimeSpan.FromDays(_options.RefreshTokenExpirationDays)
        });
    }

    private void DeleteTokens()
    {
        Response.Cookies.Delete(_options.AccessCookieName);
        Response.Cookies.Delete(_options.RefreshCookieName);
    }
}
