using Application.DTO;
using Application.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Web.Extensions;

namespace API.Controllers;

[Route("api/[controller]")]
public class UserController(
    IUserService userService) : ControllerBase
{
    [Authorize]
    [HttpGet("[action]")]
    public async Task<IActionResult> Rename([FromQuery] string name, CancellationToken ct)
    {
        await userService.Rename(User.GetUserId(), name, ct);
        return Ok();
    }

    /// <summary>
    /// Требует авторизации
    /// </summary>
    [Authorize]
    [HttpGet("[action]")]
    [Produces(typeof(UserInfo))]
    [ProducesResponseType(401)]
    public async Task<ActionResult<UserInfo>> Info(CancellationToken ct)
        => Ok(await userService.GetInfo(User.GetUserId(), ct));
}
